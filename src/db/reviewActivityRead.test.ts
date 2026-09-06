import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReviewActivity } from './reviewActivityRead';
import { db } from './schema';
import type { ReviewHistoryEntry } from './reviewHistory';

function entry(id: string, cardId: string, timestamp: number): ReviewHistoryEntry {
  return {
    id,
    cardId,
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

describe('readReviewActivity', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('reads the derived table without hydrating review records', async () => {
    await db.reviewHistory.bulkAdd([
      entry('first', 'card-1', 100),
      entry('second', 'card-1', 100),
      entry('third', 'card-1', 200),
      entry('orphan', 'deleted-card', 300),
    ]);
    const failReading = () => {
      throw new Error('review record was hydrated');
    };
    db.reviewHistory.hook('reading', failReading);

    try {
      await expect(readReviewActivity([{ id: 'card-1' }])).resolves.toEqual(
        new Map([['card-1', [100, 100, 200]]]),
      );
    } finally {
      db.reviewHistory.hook('reading').unsubscribe(failReading);
    }
  });

  it('does not query the database for an empty card set', async () => {
    const toArray = vi.spyOn(db.reviewActivity, 'toArray');

    await expect(readReviewActivity([])).resolves.toEqual(new Map());
    expect(toArray).not.toHaveBeenCalled();
  });
});
