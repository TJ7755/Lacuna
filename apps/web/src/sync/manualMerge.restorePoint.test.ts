// Live restore-point guarantee for two-device combine. The mocked
// manualMerge tests cannot see whether replace-import keeps the backups table.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreBackup, takeAutoBackup, __resetBackupThrottleForTests } from '../db/backups';
import { exportDatabase, importBackup } from '../db/portability';
import { createCard, createCourse } from '../db/repository';
import { db } from '../db/schema';
import type { BackupFile } from '@lacuna/core/db/types';
import { ManualMergeError, manualMerge } from './manualMerge';
import { mergeSnapshots } from './mergeSnapshots';

async function seedNamedCard(courseName: string, front: string, back: string) {
  const course = await createCourse(courseName);
  const card = await createCard(course.id, 'front_back', front, back);
  return { course, card };
}

async function exportSeededBackup(
  courseName: string,
  front: string,
  back: string,
): Promise<BackupFile> {
  await seedNamedCard(courseName, front, back);
  return exportDatabase();
}

describe('manualMerge restore-point guarantee', () => {
  beforeEach(async () => {
    // Wipe everything between tests so prior runs do not pollute state.
    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not save or apply an unchanged current peer snapshot', async () => {
    await seedNamedCard('Local', 'local front', 'local back');
    const initial = await exportDatabase();
    await importBackup(mergeSnapshots(initial, initial), 'replace');
    const remote = JSON.parse(JSON.stringify(await exportDatabase())) as BackupFile;
    const beforeApply = vi.fn();
    const apply = vi.spyOn(db.cards, 'bulkAdd');

    const summary = await manualMerge(
      { ...remote, exportedAt: remote.exportedAt + 1 },
      {
        kind: 'peer',
        beforeApply,
      },
    );

    expect(await db.backups.count()).toBe(0);
    expect(apply).not.toHaveBeenCalled();
    expect(beforeApply).toHaveBeenCalledTimes(1);
    expect(summary.cards).toEqual({ kept: 1, added: 0, removed: 0 });
    // Skipping a sync save must not consume the ordinary backup throttle.
    expect(await takeAutoBackup()).toBeDefined();
    expect(await db.backups.count()).toBe(1);
  });

  it('does not save an empty current peer snapshot', async () => {
    await manualMerge(await exportDatabase(), { kind: 'peer' });

    expect(await db.backups.count()).toBe(0);
  });

  it('still saves the old state before a real peer change', async () => {
    await seedNamedCard('Local', 'local front', 'local back');
    const remote = await exportDatabase();
    remote.cards[0] = { ...remote.cards[0], front: 'changed front', updatedAt: Date.now() + 1 };

    await manualMerge(remote, { kind: 'peer' });

    const [snapshot] = await db.backups.toArray();
    expect(await db.backups.count()).toBe(1);
    expect(snapshot.payload.cards[0].front).toBe('local front');
    expect((await db.cards.get(remote.cards[0].id))?.front).toBe('changed front');
  });

  it('still saves the old state before a peer deletion', async () => {
    const { card } = await seedNamedCard('Local', 'local front', 'local back');
    const remote = await exportDatabase();
    remote.tombstones = [{ table: 'cards', recordId: card.id, deletedAt: Date.now() + 1 }];

    await manualMerge(remote, { kind: 'peer' });

    const [snapshot] = await db.backups.toArray();
    expect(await db.backups.count()).toBe(1);
    expect(snapshot.payload.cards.map((row) => row.id)).toEqual([card.id]);
    expect(await db.cards.get(card.id)).toBeUndefined();
  });

  it('keeps a safety snapshot even for an already-known deletion', async () => {
    await db.tombstones.add({ table: 'cards', recordId: 'deleted-card', deletedAt: 1 });

    await manualMerge(await exportDatabase(), { kind: 'peer' });

    expect(await db.backups.count()).toBe(1);
  });

  it('keeps the safety snapshot when the no-op preflight cannot read local state', async () => {
    const remote = await exportDatabase();
    vi.spyOn(db.cards, 'toArray').mockRejectedValueOnce(new Error('Preflight unavailable'));

    await manualMerge(remote, { kind: 'peer' });

    expect(await db.backups.count()).toBe(1);
  });

  it('rejects unsupported incoming formats before creating a safety snapshot', async () => {
    const remote = await exportDatabase();

    await expect(
      manualMerge({ ...remote, app: 'lacuna', version: 10 }, { kind: 'peer' }),
    ).rejects.toThrow();

    expect(await db.backups.count()).toBe(0);
  });

  it('keeps the safety snapshot when current-format records still need normalisation', async () => {
    const { course } = await seedNamedCard('Local', 'local front', 'local back');
    await db.courses.update(course.id, { updatedAt: undefined });

    await manualMerge(await exportDatabase(), { kind: 'peer' });

    expect(await db.backups.count()).toBe(1);
    expect((await db.courses.get(course.id))?.updatedAt).toEqual(expect.any(Number));
  });

  it('keeps the safety snapshot for card defaults needing import migration', async () => {
    const { card } = await seedNamedCard('Local', 'local front', 'local back');
    await db.cards.update(card.id, { tags: undefined });

    await manualMerge(await exportDatabase(), { kind: 'peer' });

    expect(await db.backups.count()).toBe(1);
    expect((await db.cards.get(card.id))?.tags).toEqual([]);
  });

  it('keeps the safety snapshot for unrecognised incoming metadata', async () => {
    const remote = await exportDatabase();
    // Additive metadata is unrecognised by merge; it must not justify skipping a safety copy.
    const incoming = { ...remote, futureState: { steps: ['second', 'first'] } };

    await manualMerge(incoming, { kind: 'peer' });

    expect(await db.backups.count()).toBe(1);
  });

  it('keeps manual combine snapshots even when the current payload is unchanged', async () => {
    await manualMerge(await exportDatabase());

    expect(await db.backups.count()).toBe(1);
  });

  it('retains the pre-apply safety gate when skipping an unchanged peer', async () => {
    const remote = await exportDatabase();
    const failure = new Error('Pairing changed');

    await expect(
      manualMerge(remote, {
        kind: 'peer',
        beforeApply: () => {
          throw failure;
        },
      }),
    ).rejects.toMatchObject({ databaseModified: false, causeError: failure });

    expect(await db.backups.count()).toBe(0);
  });

  it('keeps a pre-combine restore point through replace-import and can restore it', async () => {
    const remote = await exportSeededBackup('Remote', 'remote front', 'remote back');
    const remoteCardIds = remote.cards.map((card) => card.id);
    expect(remoteCardIds).toHaveLength(1);

    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();

    const local = await seedNamedCard('Local', 'local front', 'local back');
    const preMergeCardIds = [local.card.id];
    const preMergeCourseIds = [local.course.id];

    const summary = await manualMerge(remote);

    expect(summary.cards).toEqual({ kept: 1, added: 1, removed: 0 });

    const snapshots = await db.backups.toArray();
    expect(snapshots).toHaveLength(1);
    const restorePoint = snapshots[0];
    expect(restorePoint.id).toEqual(expect.any(Number));
    expect(restorePoint.payload.cards.map((card) => card.id)).toEqual(preMergeCardIds);
    expect(restorePoint.payload.cards.map((card) => card.front)).toEqual(['local front']);
    expect(restorePoint.payload.courses?.map((course) => course.id)).toEqual(preMergeCourseIds);
    expect(restorePoint.payload.cards.some((card) => remoteCardIds.includes(card.id))).toBe(false);

    const liveCardIds = (await db.cards.toArray()).map((card) => card.id).sort();
    expect(liveCardIds).toEqual([...preMergeCardIds, ...remoteCardIds].sort());
    expect(restorePoint.payload.cards.map((card) => card.id)).not.toEqual(liveCardIds);

    const storedBeforeSecondReplace = await db.backups.get(restorePoint.id!);
    await importBackup(remote, 'replace');
    const surviving = await db.backups.get(restorePoint.id!);
    expect(surviving).toEqual(storedBeforeSecondReplace);
    expect(surviving?.payload.cards.map((card) => card.id)).toEqual(preMergeCardIds);

    await restoreBackup(restorePoint.id!);

    const restoredCards = await db.cards.toArray();
    const restoredCourses = await db.courses.toArray();
    expect(restoredCards.map((card) => card.id)).toEqual(preMergeCardIds);
    expect(restoredCards.map((card) => card.front)).toEqual(['local front']);
    expect(restoredCourses.map((course) => course.id)).toEqual(preMergeCourseIds);
    expect(restoredCourses.map((course) => course.name)).toEqual(['Local']);
    expect(restoredCards.some((card) => remoteCardIds.includes(card.id))).toBe(false);
    expect(await db.backups.get(restorePoint.id!)).toBeDefined();
  });

  it('leaves the restore point usable if importBackup fails', async () => {
    const remote = await exportSeededBackup('Remote', 'remote front', 'remote back');

    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();

    const local = await seedNamedCard('Local', 'local front', 'local back');
    const failImport = vi
      .spyOn(db.cards, 'bulkAdd')
      .mockRejectedValueOnce(new Error('IndexedDB write failed'));

    const result = manualMerge(remote);
    await expect(result).rejects.toBeInstanceOf(ManualMergeError);
    await expect(result).rejects.toMatchObject({
      databaseModified: true,
      message: expect.stringContaining('IndexedDB write failed'),
    });
    failImport.mockRestore();

    const snapshots = await db.backups.toArray();
    expect(snapshots).toHaveLength(1);
    const restorePoint = snapshots[0];
    expect(restorePoint.payload.cards.map((card) => card.id)).toEqual([local.card.id]);
    expect(restorePoint.payload.cards.map((card) => card.front)).toEqual(['local front']);

    await restoreBackup(restorePoint.id!);

    const restoredCards = await db.cards.toArray();
    expect(restoredCards.map((card) => card.id)).toEqual([local.card.id]);
    expect(restoredCards.map((card) => card.front)).toEqual(['local front']);
    expect(await db.courses.toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: local.course.id, name: 'Local' })]),
    );
  });
});
