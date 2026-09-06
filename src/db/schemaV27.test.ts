import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { ReviewHistoryEntry } from './reviewHistory';

const reviewHistorySchema =
  'id, cardId, deckId, courseId, primaryLessonId, schedulingUnitId, timestamp';

describe('schema v27 review-activity projection', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('preserves v26 review records and backfills the derived table', async () => {
    const legacy = new Dexie('lacuna');
    legacy.version(26).stores({ reviewHistory: reviewHistorySchema });
    await legacy.open();
    const entry: ReviewHistoryEntry = {
      id: 'review:event:one',
      eventId: 'one',
      cardId: 'card-1',
      courseId: 'course-1',
      timestamp: 123,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    await legacy.table('reviewHistory').add(entry);
    legacy.close();

    await db.open();

    expect(db.verno).toBe(27);
    expect(await db.reviewHistory.get(entry.id)).toEqual(entry);
    expect(await db.reviewActivity.toArray()).toEqual([{ cardId: 'card-1', timestamps: [123] }]);
  });

  it.each([1, 8])(
    'opens an empty v%i database through the historical migrations',
    async (version) => {
      const legacy = new Dexie('lacuna');
      legacy.version(version).stores({ cards: 'id' });
      await legacy.open();
      legacy.close();

      await db.open();

      expect(db.verno).toBe(27);
      expect(await db.reviewActivity.count()).toBe(0);
    },
  );
});
