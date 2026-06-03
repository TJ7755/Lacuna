import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { migrateDeckRecord, migrateCardRecord } from './migrations';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import type { ReviewLog } from './types';

describe('migrateDeckRecord', () => {
  it('re-tags an old deck to fsrs_version 6 and reseeds default FSRS-6 parameters', () => {
    // A deck as stored under the old 17-parameter schema: no FSRS-6 fields at all.
    const legacy = {
      id: 'd1',
      name: 'Old deck',
      examDate: 1000,
      createdAt: 0,
    };
    const migrated = migrateDeckRecord(legacy);
    expect(migrated.fsrsVersion).toBe(6);
    expect(migrated.fsrsParameters).toEqual(defaultFsrsParameters());
    expect(migrated.fsrsParameters.w).toHaveLength(21);
    expect(migrated.examObjective).toBe('expectedMarks');
    // Existing data is preserved.
    expect(migrated.name).toBe('Old deck');
    expect(migrated.examDate).toBe(1000);
  });

  it('does not overwrite an already-current deck’s parameters', () => {
    const tuned = defaultFsrsParameters();
    tuned.w[20] = 0.25;
    const migrated = migrateDeckRecord({
      id: 'd2',
      name: 'Current',
      examDate: 1,
      createdAt: 0,
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: tuned,
      examObjective: 'securedTopics',
    });
    expect(migrated.fsrsParameters.w[20]).toBe(0.25);
    expect(migrated.examObjective).toBe('securedTopics');
  });
});

describe('migrateCardRecord', () => {
  it('derives reps/lapses/state from history and adds new fields', () => {
    const history: ReviewLog[] = [
      {
        timestamp: 1,
        grade: 1,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 0.4,
        difficultyBefore: null,
        difficultyAfter: 6,
        retrievabilityAtReview: null,
      },
      {
        timestamp: 2,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        stabilityBefore: 0.4,
        stabilityAfter: 3,
        difficultyBefore: 6,
        difficultyAfter: 5.5,
        retrievabilityAtReview: 0.7,
      },
    ];
    const migrated = migrateCardRecord({
      id: 'c1',
      deckId: 'd1',
      type: 'front_back',
      front: 'q',
      back: 'a',
      stability: 3,
      difficulty: 5.5,
      lastReviewed: 2,
      history,
      createdAt: 0,
    });
    expect(migrated.reps).toBe(2);
    expect(migrated.lapses).toBe(1);
    expect(migrated.state).toBe(2); // reviewed => Review
    expect(migrated.scheduledDays).toBe(0);
    expect(migrated.learningSteps).toBe(0);
    expect(migrated.stability).toBe(3); // preserved
  });

  it('treats a never-reviewed card as State.New', () => {
    const migrated = migrateCardRecord({
      id: 'c2',
      deckId: 'd1',
      type: 'cloze',
      front: '{{c1::x}}',
      back: '',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      history: [],
      createdAt: 0,
    });
    expect(migrated.state).toBe(0);
    expect(migrated.reps).toBe(0);
    expect(migrated.lapses).toBe(0);
    expect(migrated.due).toBe(null);
  });
});

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
    const { migrateCardRecord: mc, migrateDeckRecord: md } = await import(
      './migrations'
    );
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
