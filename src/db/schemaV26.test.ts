import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ensurePreMigrationSnapshot } from './schema';
import type { BackupFile } from './types';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import {
  reviewHistoryEntriesForCard,
  reviewHistoryEntryIdForEvent,
  type ReviewHistoryEntry,
} from './reviewHistory';
import type { Card, ReviewLog } from './types';

const stores = {
  cards:
    'id, courseId, primaryLessonId, schedulingUnitId, conceptId, type, lastReviewed, sequenceItemId, occlusionRegionId',
  reviewHistory: 'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp',
};

function review(timestamp: number, eventId?: string): ReviewLog {
  return {
    ...(eventId ? { eventId } : {}),
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

function card(history: ReviewLog[]): Card {
  return {
    id: 'card-1',
    conceptId: 'concept-1',
    courseId: 'course-1',
    primaryLessonId: 'lesson-1',
    schedulingUnitId: 'lesson-1',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    stability: 2,
    difficulty: 5,
    lastReviewed: history.at(-1)?.timestamp ?? null,
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

async function createV25Database(
  history: ReviewLog[],
  canonical: ReviewHistoryEntry[] = [],
): Promise<void> {
  await createV25DatabaseWithCards([card(history)], canonical);
}

async function createV25DatabaseWithCards(
  cards: object[],
  canonical: ReviewHistoryEntry[] = [],
): Promise<void> {
  const legacy = new Dexie('lacuna');
  legacy.version(25).stores(stores);
  await legacy.open();
  await legacy.table('cards').bulkAdd(cards);
  if (canonical.length > 0) await legacy.table('reviewHistory').bulkAdd(canonical);
  legacy.close();
}

describe('schema v26 review-history cutover', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('verifies canonical rows before clearing inline projections', async () => {
    const history = [review(100, 'event-1'), review(200)];
    await createV25Database(history);

    await db.open();

    const stored = (await db.cards.get('card-1'))!;
    expect(db.verno).toBe(26);
    expect(stored.history).toEqual([]);
    expect(await db.reviewHistory.where('cardId').equals('card-1').count()).toBe(2);
    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-1'))).toMatchObject({
      cardId: 'card-1',
      timestamp: 100,
    });
    expect((await hydrateCardsWithHistory([stored]))[0].history).toEqual(history);

    await db.cards.update('card-1', { history: [review(300, 'resurrected')] });
    expect((await db.cards.get('card-1'))!.history).toEqual([]);
    expect(await db.reviewHistory.get(reviewHistoryEntryIdForEvent('resurrected'))).toBeUndefined();
  });

  it('rolls back projection clearing when a canonical write fails', async () => {
    const history = [review(100, 'event-1')];
    await createV25Database(history);
    const failCreating = () => {
      throw new Error('forced canonical write failure');
    };
    db.reviewHistory.hook('creating', failCreating);

    try {
      await expect(db.open()).rejects.toThrow('forced canonical write failure');
    } finally {
      db.reviewHistory.hook('creating').unsubscribe(failCreating);
      db.close();
    }

    const unchanged = new Dexie('lacuna');
    unchanged.version(25).stores(stores);
    await unchanged.open();
    expect(unchanged.verno).toBe(25);
    expect((await unchanged.table<Card>('cards').get('card-1'))!.history).toEqual(history);
    expect(await unchanged.table('reviewHistory').count()).toBe(0);
    unchanged.close();
  });

  it('does not duplicate an existing event with older Card ownership metadata', async () => {
    const history = [review(100, 'event-1')];
    const canonical = reviewHistoryEntriesForCard(card(history)).map((entry) => ({
      ...entry,
      primaryLessonId: 'old-lesson',
      schedulingUnitId: 'old-lesson',
    }));
    await createV25Database(history, canonical);

    await db.open();

    const stored = (await db.cards.get('card-1'))!;
    expect(stored.history).toEqual([]);
    expect(await db.reviewHistory.where('cardId').equals('card-1').count()).toBe(1);
    expect((await db.reviewHistory.toArray())[0]).toMatchObject({
      eventId: 'event-1',
      primaryLessonId: 'old-lesson',
    });
    expect((await hydrateCardsWithHistory([stored]))[0].history).toEqual(history);
  });

  it('normalises missing and invalid legacy Card histories', async () => {
    const missingHistory = { ...card([]), id: 'card-without-history' } as Partial<Card>;
    delete missingHistory.history;
    const invalidHistory = {
      ...card([]),
      id: 'card-with-invalid-history',
      history: 'not-an-array',
    };
    await createV25DatabaseWithCards([missingHistory, invalidHistory]);

    await db.open();

    expect((await db.cards.get('card-without-history'))?.history).toEqual([]);
    expect((await db.cards.get('card-with-invalid-history'))?.history).toEqual([]);
    expect(await db.reviewHistory.count()).toBe(0);
  });

  it('blocks the destructive cutover when its external restore point cannot commit', async () => {
    const history = [review(100, 'event-1')];
    await createV25Database(history);
    let captured: BackupFile | undefined;
    const failure = new Error('restore-point storage unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        ensurePreMigrationSnapshot('lacuna', 26, async (_targetVersion, snapshot) => {
          captured = snapshot;
          throw failure;
        }),
      ).rejects.toBe(failure);
    } finally {
      consoleError.mockRestore();
    }

    expect(captured?.cards[0].history).toEqual(history);
    const unchanged = new Dexie('lacuna');
    unchanged.version(25).stores(stores);
    await unchanged.open();
    expect(unchanged.verno).toBe(25);
    unchanged.close();
  });
});
