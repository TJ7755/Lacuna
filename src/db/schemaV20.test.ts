import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, readAllDataFromVersion } from './schema';
import {
  resolveReviewHistoryCollisions,
  reviewHistoryEntriesForCard,
  reviewHistoryEntryId,
  reviewHistoryEntryIdForEvent,
} from './reviewHistory';
import type { Card, ReviewLog } from './types';

function review(timestamp: number, overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
    ...overrides,
  };
}

function card(history: ReviewLog[]): Card {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    schedulingUnitId: 'deck-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: 2,
    difficulty: 5,
    lastReviewed: history[history.length - 1]?.timestamp ?? null,
    reps: history.length,
    lapses: 0,
    state: history.length > 0 ? 2 : 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('review-history entry projection', () => {
  it('uses the event id when available but keeps duplicate rows lossless', () => {
    const first = review(100, { eventId: 'event-1' });
    const second = review(100, { eventId: 'event-1' });
    const entries = reviewHistoryEntriesForCard(card([first, second]));

    expect(entries.map((entry) => entry.id)).toEqual([
      reviewHistoryEntryIdForEvent('event-1'),
      `${reviewHistoryEntryIdForEvent('event-1')}:1`,
    ]);
    expect(entries[0]).toMatchObject({
      cardId: 'card-1',
      deckId: 'deck-1',
      schedulingUnitId: 'deck-1',
      courseId: 'course-1',
      primaryLessonId: 'lesson-1',
      eventId: 'event-1',
    });
  });

  it('disambiguates legacy rows with the same timestamp', () => {
    const first = review(100);
    const second = review(100, { responseTimeSec: 3 });
    expect(reviewHistoryEntryId('card-1', first, 0)).not.toBe(
      reviewHistoryEntryId('card-1', second, 1),
    );
  });
});

describe('schema v20: additive review history', () => {
  beforeEach(async () => {
    await db.delete();
  });

  it('copies v19 card history without changing the card projection', async () => {
    const history = [review(100), review(200, { eventId: 'event-2', grade: 1 })];
    const legacy = new Dexie('lacuna');
    legacy.version(19).stores({
      decks: 'id, createdAt, examDate, folderId',
      cards:
        'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId, occlusionRegionId',
      sessionHistory: '++id, &eventId, sessionId, deckId, courseId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
      folders: 'id, parentId, createdAt',
      courses: 'id, createdAt',
      lessons: 'id, courseId, orderIndex, createdAt',
      notes: 'id, lessonId, orderIndex, createdAt',
      lessonCards: 'id, lessonId, cardId',
      lessonCardExposures: '[lessonId+cardId], lessonId, cardId, taughtAt',
      lessonCompletions: 'lessonId, completedAt',
      noteAnnotations: 'id, noteId, createdAt, updatedAt',
      practiceNodes: 'id, courseId, position, createdAt',
      practiceMilestones: 'nodeKey, courseId, scopeVersion, updatedAt, completedAt',
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      sequences: 'id, courseId, primaryLessonId, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
      lineageIdMappings: 'id, courseId',
      pendingMergeReviews: 'id, courseId',
      occlusions: 'id, courseId, primaryLessonId, createdAt',
    });
    await legacy.open();
    await legacy.table('decks').add({ id: 'deck-1', name: 'Deck', createdAt: 1, examDate: 2 });
    await legacy.table('courses').add({ id: 'course-1', name: 'Course', createdAt: 1 });
    await legacy.table('sessionHistory').add({
      eventId: 'session-event',
      sessionId: 'session-1',
      deckId: 'deck-1',
      schedulingUnitId: 'deck-1',
      courseId: 'course-1',
      timestamp: 100,
      averagePredictedRetrievability: 0.5,
    });
    await legacy.table('userPerformance').add({
      deckId: 'course-1',
      schedulingUnitId: 'course-1',
      runningMeanResponseTime: 2,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });
    await legacy.table('cards').add(card(history));
    await legacy
      .table('cards')
      .add({ ...card([]), id: 'card-without-history', history: undefined });
    legacy.close();

    await db.open();

    const migratedCard = await db.cards.get('card-1');
    expect(migratedCard?.history).toEqual(history);
    expect(await db.schedulingUnits.get('deck-1')).toBeDefined();
    expect(await db.courses.get('course-1')).toBeDefined();
    expect(await db.sessionHistory.where('eventId').equals('session-event').count()).toBe(1);
    expect(await db.userPerformance.get('course-1')).toBeDefined();
    expect(await db.reviewHistory.orderBy('timestamp').toArray()).toEqual([
      expect.objectContaining({
        id: expect.stringContaining('review:legacy:card-1:'),
        cardId: 'card-1',
        timestamp: 100,
      }),
      expect.objectContaining({
        id: reviewHistoryEntryIdForEvent('event-2'),
        cardId: 'card-1',
        timestamp: 200,
        eventId: 'event-2',
      }),
    ]);
    expect(await db.reviewHistory.where('cardId').equals('card-without-history').count()).toBe(0);
  });

  it('preserves duplicate event ids across cards during collision resolution', () => {
    const first = reviewHistoryEntriesForCard(card([review(100, { eventId: 'same-event' })]))[0];
    const second = {
      ...reviewHistoryEntriesForCard(card([review(200, { eventId: 'same-event' })]))[0],
      cardId: 'card-2',
    };
    const state = {
      usedIds: new Set<string>(),
      eventOwners: new Map<string, string>(),
      entryIdentities: new Map<string, string>(),
    };
    const resolved = [
      ...resolveReviewHistoryCollisions([first], state),
      ...resolveReviewHistoryCollisions([second], state),
    ];

    expect(resolved).toHaveLength(2);
    expect(new Set(resolved.map((entry) => entry.cardId))).toEqual(new Set(['card-1', 'card-2']));
    expect(resolveReviewHistoryCollisions([second], state)).toHaveLength(0);
    expect(resolveReviewHistoryCollisions([resolved[1]], state)).toHaveLength(0);
  });

  it('rebuilding the same projection is stable and bulkPut is idempotent', async () => {
    await db.open();
    const source = card([review(100), review(100)]);
    const entries = reviewHistoryEntriesForCard(source);
    await db.reviewHistory.bulkPut(entries);
    await db.reviewHistory.bulkPut(entries);

    expect(await db.reviewHistory.where('cardId').equals(source.id).count()).toBe(2);
    expect(reviewHistoryEntriesForCard(source)).toEqual(entries);
    expect(source.history).toHaveLength(2);
  });

  it('exposes indexed lookups and includes canonical events in raw backups', async () => {
    await db.open();
    await db.reviewHistory.add({
      ...review(300, { eventId: 'event-3' }),
      id: reviewHistoryEntryIdForEvent('event-3'),
      cardId: 'card-2',
      deckId: 'deck-2',
      schedulingUnitId: 'deck-2',
      courseId: null,
      primaryLessonId: null,
    });

    expect(await db.reviewHistory.where('cardId').equals('card-2').count()).toBe(1);
    const payload = await readAllDataFromVersion('lacuna');
    expect(payload.reviewHistory).toEqual([
      expect.objectContaining({ id: reviewHistoryEntryIdForEvent('event-3') }),
    ]);
  });
});
