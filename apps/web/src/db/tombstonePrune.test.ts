import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { TOMBSTONE_RETENTION_MS } from './mutationStamp';
import { pruneExpiredTombstones } from './tombstonePrune';

describe('pruneExpiredTombstones', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('deletes tombstones older than the retention window and keeps younger ones', async () => {
    const now = 1_000_000_000_000;
    await db.tombstones.bulkPut([
      { table: 'cards', recordId: 'old', deletedAt: now - TOMBSTONE_RETENTION_MS - 1 },
      { table: 'cards', recordId: 'edge', deletedAt: now - TOMBSTONE_RETENTION_MS },
      { table: 'cards', recordId: 'fresh', deletedAt: now - TOMBSTONE_RETENTION_MS + 1 },
    ]);

    const removed = await pruneExpiredTombstones(now);
    expect(removed).toBe(1);
    expect(await db.tombstones.toArray()).toEqual([
      { table: 'cards', recordId: 'edge', deletedAt: now - TOMBSTONE_RETENTION_MS },
      { table: 'cards', recordId: 'fresh', deletedAt: now - TOMBSTONE_RETENTION_MS + 1 },
    ]);
  });
});
