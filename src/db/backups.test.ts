// Regression tests for automatic local backups and restore points.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  deleteBackup,
  mirrorToFolder,
  restoreBackup,
  takeAutoBackup,
  autoBackupIfStale,
  __resetBackupThrottleForTests,
} from './backups';
import { createCard, createDeck } from './repository';
import type { BackupFile, ItemPayload } from './types';

describe('backups', () => {
  beforeEach(async () => {
    // Wipe everything between tests so prior runs do not pollute state.
    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takeAutoBackup stores a snapshot in the backups table', async () => {
    await createDeck('Alpha');
    await takeAutoBackup();

    const snapshots = await db.backups.toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].deckCount).toBe(1);
    expect(snapshots[0].payload).toBeDefined();
    expect(snapshots[0].payload.decks![0].name).toBe('Alpha');
  });

  it('restoreBackup replaces the database from a stored snapshot', async () => {
    await createDeck('Restoreable');
    await takeAutoBackup();
    const [snapshot] = await db.backups.toArray();

    await db.decks.clear();
    expect(await db.decks.toArray()).toEqual([]);

    await restoreBackup(snapshot.id!);

    const restored = await db.decks.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('Restoreable');
  });

  it('round-trips a structured item payload through backup and restore', async () => {
    const deck = await createDeck('Mathematics');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8.', 'x = 4');
    const payload: ItemPayload = {
      v: 1,
      kind: 'numeric',
      answer: { kind: 'within', value: '4', tolerance: 0.01 },
      fixtures: [
        {
          id: 'fixture-1',
          studentAnswer: '3.995',
          expectedMarks: 1,
          note: 'Accepted at the lower tolerance boundary',
        },
      ],
    };
    await db.cards.update(card.id, { payload });

    await takeAutoBackup();
    const [snapshot] = await db.backups.toArray();
    expect(snapshot.payload.cards[0].payload).toEqual(payload);

    await db.cards.clear();
    await restoreBackup(snapshot.id!);

    const restored = await db.cards.get(card.id);
    expect(restored?.payload).toEqual(payload);
    expect(JSON.stringify(restored?.payload)).toBe(JSON.stringify(payload));
  });

  it('deleteBackup removes a stored restore point', async () => {
    await createDeck('Disposable');
    await takeAutoBackup();
    const [snapshot] = await db.backups.toArray();
    expect(await db.backups.count()).toBe(1);

    await deleteBackup(snapshot.id!);

    expect(await db.backups.count()).toBe(0);
  });

  it('autoBackupIfStale skips backup when a recent restore point exists', async () => {
    await createDeck('Fresh');
    await takeAutoBackup();
    const countBefore = await db.backups.count();

    await autoBackupIfStale();

    expect(await db.backups.count()).toBe(countBefore);
  });

  it('keeps ten ordinary restore points without pruning a pre-migration snapshot', async () => {
    let now = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    await takeAutoBackup(true);
    const preMigration = await db.backups.orderBy('createdAt').first();
    await db.backups.update(preMigration!.id!, { tag: 'pre-migration' });

    for (let index = 0; index < 11; index += 1) {
      now = 1000 + index;
      await takeAutoBackup(true);
    }

    const snapshots = await db.backups.orderBy('createdAt').toArray();
    const ordinary = snapshots.filter((snapshot) => snapshot.tag !== 'pre-migration');

    expect(snapshots).toHaveLength(11);
    expect(snapshots.find((snapshot) => snapshot.tag === 'pre-migration')?.id).toBe(
      preMigration!.id,
    );
    expect(ordinary).toHaveLength(10);
    expect(ordinary.map((snapshot) => snapshot.createdAt)).toEqual([
      1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
    ]);
  });

  it('throttles ordinary backups for five minutes', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    await takeAutoBackup();
    now += 5 * 60 * 1000 - 1;
    await takeAutoBackup();
    expect(await db.backups.count()).toBe(1);

    now += 1;
    await takeAutoBackup();
    expect(await db.backups.count()).toBe(2);
  });

  it('allows forced backups inside the five-minute throttle window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await takeAutoBackup();
    await takeAutoBackup(true);

    expect(await db.backups.count()).toBe(2);
  });

  it('prunes only old Lacuna backup files from the folder mirror', async () => {
    const removeEntry = vi.fn(async () => undefined);
    const names = [
      'lacuna-backup-2026-08-01T00-00-00.json',
      'lacuna-backup-2026-08-02T00-00-00.json',
      'lacuna-backup-2026-08-03T00-00-00.json',
      'lacuna-backup-2026-08-04T00-00-00.json',
      'lacuna-backup-2026-08-05T00-00-00.json',
      'lacuna-backup-2026-08-06T00-00-00.json',
      'lacuna-backup-2026-08-07T00-00-00.json',
      'lacuna-backup-2026-08-08T00-00-00.json',
      'lacuna-backup-2026-08-09T00-00-00.json',
      'lacuna-backup-2026-08-10T00-00-00.json',
      'lacuna-backup-2026-08-11T00-00-00.json',
      'lacuna-backup-2026-08-12T00-00-00.json',
      'notes.txt',
    ];
    const handle = {
      name: 'Backups',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({ write: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }),
      })),
      async *values() {
        for (const name of names) yield { kind: name === 'notes.txt' ? 'file' as const : 'file' as const, name };
      },
      removeEntry,
    };
    vi.spyOn(db.appState, 'get').mockResolvedValue({ key: 'backupFolderHandle', value: handle });

    await mirrorToFolder({ exportedAt: Date.UTC(2026, 7, 12) } as BackupFile);

    expect(removeEntry).toHaveBeenCalledTimes(2);
    expect(removeEntry).toHaveBeenNthCalledWith(1, names[0]);
    expect(removeEntry).toHaveBeenNthCalledWith(2, names[1]);
    expect(removeEntry).not.toHaveBeenCalledWith('notes.txt');
  });
});
