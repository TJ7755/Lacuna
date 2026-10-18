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
import { createCard, createCourse, createLesson } from './repository';
import { assetUrl, storeImageBlob } from './assets';
import { PRE_V22_BACKUP_MESSAGE } from './portability';
import type { BackupFile, ItemPayload } from './types';

const replace = vi.hoisted(() =>
  vi.fn((_kind: string, operation: () => Promise<unknown>) => operation()),
);

vi.mock('./replacementLifecycle', () => ({
  replacementLifecycle: { replace },
}));

describe('backups', () => {
  beforeEach(async () => {
    // Wipe everything between tests so prior runs do not pollute state.
    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();
    replace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takeAutoBackup stores the lesson count with the snapshot', async () => {
    const course = await createCourse('Alpha');
    await createLesson(course.id, 'Foundations');
    await createLesson(course.id, 'Applications');
    const payload = await takeAutoBackup();

    const snapshots = await db.backups.toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].deckCount).toBe(2);
    expect(snapshots[0].payload).toBeDefined();
    expect(snapshots[0].payload.decks).toBeUndefined();
    expect(snapshots[0].payload.courses?.[0].name).toBe('Alpha');
    expect(payload).toEqual(snapshots[0].payload);
  });

  it('restoreBackup replaces the database from a stored snapshot', async () => {
    await createCourse('Restoreable');
    await takeAutoBackup();
    const [snapshot] = await db.backups.toArray();

    await db.schedulingUnits.clear();
    expect(await db.schedulingUnits.toArray()).toEqual([]);

    await restoreBackup(snapshot.id!);

    expect(replace).toHaveBeenCalledWith('manual', expect.any(Function));
    const restored = await db.schedulingUnits.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('Restoreable');
  });

  it('refuses to restore a pre-v22 snapshot and leaves the backups table untouched', async () => {
    await createCourse('Current');
    const id = await db.backups.add({
      createdAt: Date.now(),
      deckCount: 1,
      cardCount: 0,
      payload: {
        app: 'lacuna',
        version: 9,
        exportedAt: 1,
        decks: [{ id: 'old-deck' }],
        cards: [],
        assets: [],
        sessionHistory: [],
        userPerformance: [],
      } as unknown as BackupFile,
    });

    try {
      await restoreBackup(id);
      throw new Error('expected restoreBackup to reject');
    } catch (error) {
      if (error instanceof Error && error.message === 'expected restoreBackup to reject') {
        throw error;
      }
      // Same narrowing the restore UI uses: the specific refusal must reach the caller.
      expect(error instanceof Error ? error.message : 'Restore failed.').toBe(
        PRE_V22_BACKUP_MESSAGE,
      );
    }
    expect(await db.backups.count()).toBe(1);
    expect(await db.courses.count()).toBe(1);
  });

  it('round-trips a structured item payload through backup and restore', async () => {
    const deck = await createCourse('Mathematics');
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
    await createCourse('Disposable');
    await takeAutoBackup();
    const [snapshot] = await db.backups.toArray();
    expect(await db.backups.count()).toBe(1);

    await deleteBackup(snapshot.id!);

    expect(await db.backups.count()).toBe(0);
  });

  it('autoBackupIfStale skips backup when a recent restore point exists', async () => {
    await createCourse('Fresh');
    await takeAutoBackup();
    const countBefore = await db.backups.count();

    await autoBackupIfStale();

    expect(await db.backups.count()).toBe(countBefore);
  });

  it('takes a backup and schedules asset cleanup when no restore point is fresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(24 * 60 * 60 * 1000 + 1);

    await autoBackupIfStale();

    expect(await db.backups.count()).toBe(1);
  });

  it('keeps the backup when mirroring fails and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = {
      name: 'Backups',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({
          write: vi.fn(async () => {
            throw new Error('disk full');
          }),
          close: vi.fn(async () => undefined),
        }),
      })),
    };
    vi.spyOn(db.appState, 'get').mockResolvedValue({ key: 'backupFolderHandle', value: handle });

    await takeAutoBackup(true);

    expect(await db.backups.count()).toBe(1);
    expect(warn).toHaveBeenCalledWith('Folder mirror failed:', expect.any(Error));
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
    expect(await takeAutoBackup()).toBeUndefined();
    expect(await db.backups.count()).toBe(1);

    now += 1;
    await takeAutoBackup();
    expect(await db.backups.count()).toBe(2);
  });

  it('retries immediately after a restore-point write fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const add = vi.spyOn(db.backups, 'add').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(takeAutoBackup()).rejects.toThrow('storage unavailable');
    expect(await db.backups.count()).toBe(0);

    const payload = await takeAutoBackup();

    expect(payload).toBeDefined();
    expect(add).toHaveBeenCalledTimes(2);
    expect(await db.backups.count()).toBe(1);
  });

  it('stores no restore point when asset encoding fails and allows an immediate retry', async () => {
    const course = await createCourse('Media backup');
    const asset = await storeImageBlob(new Blob(['diagram']), 'image/png', 20, 10);
    await createCard(course.id, 'front_back', `![Diagram](${assetUrl(asset.hash)})`, 'Answer');
    vi.spyOn(globalThis, 'btoa').mockImplementationOnce(() => {
      throw new Error('Asset encoding failed');
    });

    await expect(takeAutoBackup()).rejects.toThrow('Asset encoding failed');
    expect(await db.backups.count()).toBe(0);

    const payload = await takeAutoBackup();
    expect(payload?.assets).toEqual([
      {
        hash: asset.hash,
        data: 'ZGlhZ3JhbQ==',
        mimeType: 'image/png',
        kind: 'image',
        width: 20,
        height: 10,
        createdAt: asset.createdAt,
      },
    ]);
    expect(await db.backups.count()).toBe(1);
  });
  it('takes the first backup even when the clock is inside the first five minutes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);

    expect(await takeAutoBackup()).toBeDefined();
    expect(await db.backups.count()).toBe(1);
  });

  it('preserves a newer forced backup throttle when an earlier pending write fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    let rejectFirst!: (error: Error) => void;
    let signalFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => { signalFirst = resolve; });
    vi.spyOn(db.backups, 'add').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectFirst = reject;
      signalFirst();
    }) as ReturnType<typeof db.backups.add>);
    const firstFailure = expect(takeAutoBackup()).rejects.toThrow('storage unavailable');
    await firstStarted;

    await takeAutoBackup(true);
    rejectFirst(new Error('storage unavailable'));
    await firstFailure;

    expect(await takeAutoBackup()).toBeUndefined();
    expect(await db.backups.count()).toBe(1);
  });
  it.each([false, true])('retries after overlapping ordinary and forced writes both fail (prior backup: %s)', async (priorBackup) => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    if (priorBackup) {
      await takeAutoBackup();
      now += 5 * 60 * 1000;
    }
    let rejectOrdinary!: (error: Error) => void;
    let rejectForced!: (error: Error) => void;
    let signalOrdinary!: () => void;
    let signalForced!: () => void;
    const ordinaryStarted = new Promise<void>((resolve) => { signalOrdinary = resolve; });
    const forcedStarted = new Promise<void>((resolve) => { signalForced = resolve; });
    const add = vi.spyOn(db.backups, 'add')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectOrdinary = reject;
        signalOrdinary();
      }) as ReturnType<typeof db.backups.add>)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectForced = reject;
        signalForced();
      }) as ReturnType<typeof db.backups.add>);
    const ordinaryFailure = expect(takeAutoBackup()).rejects.toThrow('ordinary storage unavailable');
    await ordinaryStarted;
    const forcedFailure = expect(takeAutoBackup(true)).rejects.toThrow('forced storage unavailable');
    await forcedStarted;

    rejectOrdinary(new Error('ordinary storage unavailable'));
    await ordinaryFailure;
    rejectForced(new Error('forced storage unavailable'));
    await forcedFailure;

    expect(await takeAutoBackup()).toBeDefined();
    expect(add).toHaveBeenCalledTimes(3);
    expect(await db.backups.count()).toBe(priorBackup ? 2 : 1);
  });

  it('retains the previous successful throttle when two overlapping forced writes fail', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await takeAutoBackup();
    const lastSuccess = now;
    now += 10;
    let rejectFirst!: (error: Error) => void;
    let rejectSecond!: (error: Error) => void;
    let signalFirst!: () => void;
    let signalSecond!: () => void;
    const firstStarted = new Promise<void>((resolve) => { signalFirst = resolve; });
    const secondStarted = new Promise<void>((resolve) => { signalSecond = resolve; });
    vi.spyOn(db.backups, 'add')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectFirst = reject;
        signalFirst();
      }) as ReturnType<typeof db.backups.add>)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectSecond = reject;
        signalSecond();
      }) as ReturnType<typeof db.backups.add>);
    const firstFailure = expect(takeAutoBackup(true)).rejects.toThrow('first storage unavailable');
    await firstStarted;
    now += 10;
    const secondFailure = expect(takeAutoBackup(true)).rejects.toThrow('second storage unavailable');
    await secondStarted;
    rejectFirst(new Error('first storage unavailable'));
    await firstFailure;
    rejectSecond(new Error('second storage unavailable'));
    await secondFailure;

    expect(await takeAutoBackup()).toBeUndefined();
    now = lastSuccess + 5 * 60 * 1000 - 1;
    expect(await takeAutoBackup()).toBeUndefined();
    now += 1;
    expect(await takeAutoBackup()).toBeDefined();
    expect(await db.backups.count()).toBe(2);
  });
  it('coalesces ordinary backups while an earlier restore-point write is pending', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const writeSnapshot = db.backups.add.bind(db.backups);
    let releaseWrite!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const add = vi.spyOn(db.backups, 'add').mockImplementationOnce((snapshot) =>
      new Promise<void>((resolve) => {
        releaseWrite = resolve;
        signalStarted();
      }).then(() => writeSnapshot(snapshot)) as ReturnType<typeof db.backups.add>,
    );
    const pending = takeAutoBackup();
    await started;

    expect(await takeAutoBackup()).toBeUndefined();
    expect(add).toHaveBeenCalledOnce();
    expect(await db.backups.count()).toBe(0);

    releaseWrite();
    expect(await pending).toBeDefined();
    expect(await db.backups.count()).toBe(1);
    expect(await takeAutoBackup()).toBeUndefined();
    expect(add).toHaveBeenCalledOnce();
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
        createWritable: async () => ({
          write: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
        }),
      })),
      async *values() {
        for (const name of names)
          yield { kind: name === 'notes.txt' ? ('file' as const) : ('file' as const), name };
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
