import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  clearSyncState,
  clearTombstone,
  lessonCardExposureId,
  recordTombstone,
  recordTombstones,
  readSyncState,
  stampUpdatedAt,
  updateSyncState,
  writeSyncState,
} from './mutationStamp';

describe('mutationStamp', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  // This id is the tombstone matching key and is persisted in users' databases.
  // Changing the format silently breaks deletion and restoration of existing rows.
  // The test exists to make that change loud.
  it('formats lessonCardExposureId as lessonId:cardId', () => {
    expect(lessonCardExposureId('lesson-1', 'card-1')).toBe('lesson-1:card-1');
    expect(lessonCardExposureId('', 'card-1')).toBe(':card-1');
    expect(lessonCardExposureId('lesson-1', '')).toBe('lesson-1:');
    expect(lessonCardExposureId('', '')).toBe(':');
    expect(lessonCardExposureId('les:son', 'ca:rd')).toBe('les:son:ca:rd');
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

  it('reads, writes and clears syncState under appState', async () => {
    expect(await readSyncState()).toBeUndefined();
    await writeSyncState({ relayUrl: 'https://relay.example', channelId: 'ch-1', lastError: null });
    expect(await readSyncState()).toEqual({
      relayUrl: 'https://relay.example',
      channelId: 'ch-1',
      lastError: null,
    });
    await clearSyncState();
    expect(await readSyncState()).toBeUndefined();
  });

  it('serialises concurrent sync-state updates without restoring removed credentials', async () => {
    await writeSyncState({
      relayUrl: 'https://relay.example',
      channelId: 'ch-1',
      remembered: { channelKeyHex: 'aa'.repeat(32), writeToken: 'bb'.repeat(32) },
    });

    const recordSuccess = updateSyncState((current) => ({
      ...current,
      lastSuccessfulSyncAt: 100,
      lastPushedGeneration: 'generation-1',
    }));
    const lock = updateSyncState((current) => {
      if (!current) return current;
      const { remembered: _omitted, ...locked } = current;
      return locked;
    });

    await Promise.all([recordSuccess, lock]);

    expect(await readSyncState()).toEqual({
      relayUrl: 'https://relay.example',
      channelId: 'ch-1',
      lastSuccessfulSyncAt: 100,
      lastPushedGeneration: 'generation-1',
    });
  });
});
