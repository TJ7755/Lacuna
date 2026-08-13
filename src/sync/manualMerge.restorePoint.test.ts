// Live restore-point guarantee for two-device combine. The mocked
// manualMerge tests cannot see whether replace-import keeps the backups table.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreBackup, __resetBackupThrottleForTests } from '../db/backups';
import { exportDatabase, importBackup } from '../db/portability';
import { createCard, createCourse } from '../db/repository';
import { db } from '../db/schema';
import type { BackupFile } from '../db/types';
import { ManualMergeError, manualMerge } from './manualMerge';

async function seedNamedCard(courseName: string, front: string, back: string) {
  const course = await createCourse(courseName);
  const card = await createCard(course.id, 'front_back', front, back);
  return { course, card };
}

async function exportSeededBackup(courseName: string, front: string, back: string): Promise<BackupFile> {
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
    const failImport = vi.spyOn(db.cards, 'bulkAdd').mockRejectedValueOnce(
      new Error('IndexedDB write failed'),
    );

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
