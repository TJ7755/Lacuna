import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  clearTombstone,
  recordTombstone,
  recordTombstones,
  readSyncState,
  stampUpdatedAt,
  writeSyncState,
} from './mutationStamp';

describe('mutationStamp', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('stamps updatedAt without mutating the original record', () => {
    const original = { id: 'n1', createdAt: 10 };
    const stamped = stampUpdatedAt(original, 99);
    expect(stamped.updatedAt).toBe(99);
    expect(original).toEqual({ id: 'n1', createdAt: 10 });
  });

  it('writes and clears a tombstone inside the caller transaction', async () => {
    await db.transaction('rw', [db.tombstones], async (tx) => {
      await recordTombstone(tx, 'cards', 'card-1', 50);
    });
    expect(await db.tombstones.get(['cards', 'card-1'])).toEqual({
      table: 'cards',
      recordId: 'card-1',
      deletedAt: 50,
    });

    await db.transaction('rw', [db.tombstones], async (tx) => {
      await clearTombstone(tx, 'cards', 'card-1');
    });
    expect(await db.tombstones.get(['cards', 'card-1'])).toBeUndefined();
  });

  it('leaves no tombstone when the surrounding transaction rolls back', async () => {
    await expect(
      db.transaction('rw', [db.tombstones], async (tx) => {
        await recordTombstones(tx, 'courses', ['course-1', 'course-2'], 7);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await db.tombstones.count()).toBe(0);
  });

  it('reads and writes syncState under appState', async () => {
    expect(await readSyncState()).toBeUndefined();
    await writeSyncState({ channelId: 'ch-1', lastError: null });
    expect(await readSyncState()).toEqual({ channelId: 'ch-1', lastError: null });
  });
});
