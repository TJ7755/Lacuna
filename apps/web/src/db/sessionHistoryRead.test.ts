import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { startOfDay } from '@lacuna/core/utils/datetime';
import { db } from './schema';
import { listGlobalDailySessionHistory } from './sessionHistoryRead';
import type { SessionHistoryEntry } from '@lacuna/core/db/types';

function sample(
  courseId: string,
  timestamp: number,
  averagePredictedRetrievability: number,
): SessionHistoryEntry {
  return {
    eventId: `${courseId}:${timestamp}`,
    timestamp,
    deckId: courseId,
    courseId,
    schedulingUnitId: courseId,
    averagePredictedRetrievability,
  };
}

describe('session-history read projections', () => {
  beforeEach(async () => {
    await db.sessionHistory.clear();
  });

  it('materialises only the exact daily rows consumed by trajectory charts', async () => {
    const day = startOfDay(Date.parse('2026-08-20T12:00:00Z'));
    const all = [
      sample('course-1', day + 1_000, 0.4),
      sample('course-1', day + 2_000, 0.6),
      sample('course-2', day + 1_500, 0.8),
      sample('course-1', day + 86_400_000 + 1_000, 0.7),
    ];
    await db.sessionHistory.bulkAdd([
      ...all,
      { ...sample('legacy-deck', day + 3_000, 0.9), courseId: undefined },
    ]);

    const global = await listGlobalDailySessionHistory();

    expect(global).toEqual([
      expect.objectContaining(all[2]),
      expect.objectContaining(all[1]),
      expect.objectContaining(all[3]),
    ]);
  });
});
