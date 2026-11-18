import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import { pruneExpiredTombstones } from './tombstonePrune';

describe('pruneExpiredTombstones', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('deletes tombstones older than 90 days and retains the boundary and newer rows', async () => {
    const now = 1_000_000_000_000;
    const retention = 90 * 24 * 60 * 60 * 1000;
    await db.tombstones.bulkPut([
      { table: 'cards', recordId: 'old', deletedAt: now - retention - 1 },
      { table: 'cards', recordId: 'edge', deletedAt: now - retention },
      { table: 'cards', recordId: 'fresh', deletedAt: now - retention + 1 },
    ]);

    vi.spyOn(Date, 'now').mockReturnValue(now);
    const removed = await pruneExpiredTombstones();
    expect(removed).toBe(1);
    expect(await db.tombstones.toArray()).toEqual([
      { table: 'cards', recordId: 'edge', deletedAt: now - retention },
      { table: 'cards', recordId: 'fresh', deletedAt: now - retention + 1 },
    ]);
  });
});
