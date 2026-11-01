import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { SyncState } from '@lacuna/core/db/types';
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

  it('migrates the saved legacy relay on load without changing the pairing', async () => {
    const saved: SyncState = {
      relayUrl: 'https://lacuna-relay.vercel.app',
      channelId: '0123456789abcdef0123456789abcdef',
      wrappedKeyMaterial: 'cc'.repeat(64),
      remembered: { channelKeyHex: 'aa'.repeat(32), writeToken: 'bb'.repeat(32) },
      shareLinks: {
        share: { relayUrl: 'https://lacuna-relay.vercel.app', writeToken: 'dd'.repeat(32) },
      },
      lastPushedGeneration: '"7"',
      lastSuccessfulSyncAt: 100,
      lastSnapshotBytes: 256,
      lastSnapshotPlaintextBytes: 512,
      lastError: null,
    };
    await writeSyncState(saved);

    const migrated = { ...saved, relayUrl: 'https://relay.getlacuna.app' };
    expect(await readSyncState()).toEqual(migrated);
    expect((await db.appState.get('syncState'))?.value).toEqual(migrated);
    expect(await readSyncState()).toEqual(migrated);
  });

  it.each([
    'https://lacuna-relay.vercel.app/',
    'HTTPS://LACUNA-RELAY.VERCEL.APP',
    'hTtPs://Lacuna-Relay.Vercel.App///',
  ])('migrates only origin case and trailing slashes: %s', async (relayUrl) => {
    const locked = { relayUrl, channelId: 'ch-1', wrappedKeyMaterial: 'cc'.repeat(64) };
    await writeSyncState(locked);

    expect(await readSyncState()).toEqual({ ...locked, relayUrl: 'https://relay.getlacuna.app' });
  });

  it.each([
    'https://private-relay.example/sync/',
    'https://relay.getlacuna.app',
    'https://RELAY.getlacuna.app/',
    'http://lacuna-relay.vercel.app',
    'https://other.vercel.app',
    'https://sub.lacuna-relay.vercel.app',
    'https://lacuna-relay.vercel.app.example',
    'https://lacuna-relay.vercel.app/sync',
    'https://lacuna-relay.vercel.app/../',
    'https://lacuna-relay.vercel.app?debug=1',
    'https://lacuna-relay.vercel.app/#fragment',
    'https://user@lacuna-relay.vercel.app',
    'https://lacuna-relay.vercel.app:443',
    'https://lacuna-relay.vercel.app:8443',
    ' https://lacuna-relay.vercel.app',
    'https://lacuna-relay.vercel.app\n',
    'invalid-relay',
    undefined,
  ])('leaves every other saved relay unchanged: %s', async (relayUrl) => {
    const saved = { relayUrl, channelId: 'ch-1' };
    await writeSyncState(saved);

    expect(await readSyncState()).toEqual(saved);
    expect((await db.appState.get('syncState'))?.value).toEqual(saved);
  });

  it('serialises migration with credential removal without restoring stale fields', async () => {
    await writeSyncState({
      relayUrl: 'https://lacuna-relay.vercel.app',
      channelId: 'ch-1',
      remembered: { channelKeyHex: 'aa'.repeat(32), writeToken: 'bb'.repeat(32) },
    });

    await Promise.all([
      readSyncState(),
      updateSyncState((current) => {
        if (!current) return current;
        const { remembered: _omitted, ...locked } = current;
        return locked;
      }),
      readSyncState(),
    ]);

    expect(await readSyncState()).toEqual({
      relayUrl: 'https://relay.getlacuna.app',
      channelId: 'ch-1',
    });
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
