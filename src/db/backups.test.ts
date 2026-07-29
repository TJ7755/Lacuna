// Regression tests for automatic local backups and restore points.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  deleteBackup,
  restoreBackup,
  takeAutoBackup,
  autoBackupIfStale,
  __resetBackupThrottleForTests,
} from './backups';
import { createDeck } from './repository';

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
    expect(snapshots[0].payload.decks[0].name).toBe('Alpha');
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
});
