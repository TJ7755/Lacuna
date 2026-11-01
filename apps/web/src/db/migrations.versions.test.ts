import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';

describe('Dexie upgrade from the old 17-parameter schema', () => {
  it('loads an old deck, migrates it in place and keeps cards', async () => {
    const dbName = `lacuna-migration-${Date.now()}`;

    // 1. Create the database at version 1 (the pre-FSRS-6 schema) and insert old
    //    records lacking every FSRS-6 field.
    const v1 = new Dexie(dbName);
    v1.version(1).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
    });
    await v1.open();
    await v1.table('decks').add({
      id: 'd1',
      name: 'Legacy deck',
      examDate: 5000,
      createdAt: 0,
    });
    await v1.table('cards').add({
      id: 'c1',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'front_back',
      front: 'q',
      back: 'a',
      stability: 4,
      difficulty: 5,
      lastReviewed: 100,
      history: [],
      createdAt: 0,
    });
    v1.close();

    // 2. Reopen at version 2 with the upgrade hook (mirrors src/db/schema.ts).
    const { migrateCardRecord: mc, migrateDeckRecord: md } = await import('./migrations');
    const v2 = new Dexie(dbName);
    v2.version(1).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
    });
    v2.version(2)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('decks')
          .toCollection()
          .modify((deck) => Object.assign(deck, md(deck)));
        await tx
          .table('cards')
          .toCollection()
          .modify((card) => Object.assign(card, mc(card)));
      });
    await v2.open();

    const deck = await v2.table('decks').get('d1');
    expect(deck.fsrsVersion).toBe(6);
    expect(deck.fsrsParameters.w).toHaveLength(21);
    expect(deck.examObjective).toBe('expectedMarks');
    expect(deck.name).toBe('Legacy deck'); // not dropped

    const card = await v2.table('cards').get('c1');
    expect(card.state).toBe(2);
    expect(card.reps).toBe(0);
    expect(card.stability).toBe(4); // preserved
    v2.close();
  });
});

describe('Dexie upgrade to v13: retire the typing card type', () => {
  it('folds an existing typing card into front_back on open', async () => {
    const { db } = await import('./schema');
    await db.delete();

    const legacy = new Dexie('lacuna');
    legacy.version(12).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
    });
    await legacy.open();
    await legacy.table('decks').add({
      id: 'd1',
      name: 'Legacy deck',
      examDate: 1000,
      createdAt: 0,
      fsrsVersion: 6,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
    });
    await legacy.table('cards').add({
      id: 'typing-card',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'typing',
      front: 'Capital of Japan?',
      back: 'Tokyo',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 0,
    });
    await legacy.table('cards').add({
      id: 'front-back-card',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'front_back',
      front: 'q',
      back: 'a',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 0,
    });
    legacy.close();

    await db.open();

    const typingCard = await db.cards.get('typing-card');
    expect(typingCard?.type).toBe('front_back');
    expect(typingCard?.front).toBe('Capital of Japan?');
    expect(typingCard?.back).toBe('Tokyo');

    const untouched = await db.cards.get('front-back-card');
    expect(untouched?.type).toBe('front_back');

    await db.delete();
  });
});

describe('Dexie upgrade to v16: stable review-event identity', () => {
  it('keeps legacy aggregates and rejects duplicate new event ids', async () => {
    const dbName = `lacuna-review-events-${Date.now()}`;
    const legacy = new Dexie(dbName);
    legacy.version(15).stores({
      sessionHistory: '++id, deckId, courseId, timestamp',
    });
    await legacy.open();
    await legacy.table('sessionHistory').add({
      deckId: 'deck-1',
      schedulingUnitId: 'deck-1',
      timestamp: 1000,
      averagePredictedRetrievability: 0.5,
    });
    legacy.close();

    const current = new Dexie(dbName);
    current.version(15).stores({
      sessionHistory: '++id, deckId, courseId, timestamp',
    });
    current.version(16).stores({
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
    });
    await current.open();

    expect(await current.table('sessionHistory').count()).toBe(1);
    await current.table('sessionHistory').add({
      eventId: 'event-1',
      sessionId: 'session-1',
      deckId: 'deck-1',
      schedulingUnitId: 'deck-1',
      timestamp: 2000,
      averagePredictedRetrievability: 0.6,
    });
    await expect(
      current.table('sessionHistory').add({
        eventId: 'event-1',
        sessionId: 'session-1',
        deckId: 'deck-1',
        schedulingUnitId: 'deck-1',
        timestamp: 3000,
        averagePredictedRetrievability: 0.7,
      }),
    ).rejects.toThrow();

    current.close();
    await Dexie.delete(dbName);
  });
});

describe('Dexie upgrade to v17: revision plans', () => {
  it('keeps v16 data, starts with no plans and enforces one plan per assessment', async () => {
    const dbName = `lacuna-revision-plans-${Date.now()}`;
    const legacy = new Dexie(dbName);
    legacy.version(16).stores({
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
    });
    await legacy.open();
    await legacy.table('courseAssessments').add({
      id: 'assessment-1',
      courseId: 'course-1',
      kind: 'checkpoint',
      examDate: 1_000,
      createdAt: 1,
    });
    legacy.close();

    const current = new Dexie(dbName);
    current.version(16).stores({
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
    });
    current.version(17).stores({
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
    });
    await current.open();
    expect(await current.table('courseAssessments').count()).toBe(1);
    expect(await current.table('revisionPlans').count()).toBe(0);
    await current.table('revisionPlans').add({
      id: 'plan-1',
      assessmentId: 'assessment-1',
      courseId: 'course-1',
      status: 'active',
      updatedAt: 1,
    });
    await expect(
      current.table('revisionPlans').add({
        id: 'plan-2',
        assessmentId: 'assessment-1',
        courseId: 'course-1',
        status: 'active',
        updatedAt: 2,
      }),
    ).rejects.toThrow();
    current.close();
    await Dexie.delete(dbName);
  });

  it('includes assessments and plans in raw pre-migration payloads', async () => {
    const dbName = `lacuna-revision-snapshot-${Date.now()}`;
    const raw = new Dexie(dbName);
    raw.version(17).stores({
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
    });
    await raw.open();
    await raw.table('courseAssessments').add({
      id: 'assessment-1',
      courseId: 'course-1',
      name: 'Paper',
      kind: 'checkpoint',
      examDate: 2_000,
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: 1,
    });
    await raw.table('revisionPlans').add({
      id: 'plan-1',
      assessmentId: 'assessment-1',
      courseId: 'course-1',
      status: 'active',
      updatedAt: 1,
    });
    raw.close();

    const { readAllDataFromVersion } = await import('./schema');
    const payload = await readAllDataFromVersion(dbName);
    expect(payload.courseAssessments?.map((assessment) => assessment.id)).toEqual(['assessment-1']);
    expect(payload.revisionPlans?.map((plan) => plan.id)).toEqual(['plan-1']);
    await Dexie.delete(dbName);
  });
});
