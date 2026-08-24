import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { BACKUP_VERSION, exportDatabase, importBackup, validateBackup } from './portability';
import { defaultFsrsParameters } from '../fsrs/params';
import type { BackupFile, Tombstone } from './types';

async function reset() {
  db.close();
  await db.delete();
  await db.open();
}

function emptyBackup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: BACKUP_VERSION,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    concepts: [],
    questions: [],
    questionConcepts: [],
    questionAttempts: [],
    ...overrides,
  };
}

describe('backup tombstones', () => {
  beforeEach(reset);

  it('round-trips tombstones at version 11', async () => {
    const tombstones: Tombstone[] = [
      { table: 'cards', recordId: 'card-gone', deletedAt: 50 },
      { table: 'courses', recordId: 'course-gone', deletedAt: 60 },
    ];
    await db.tombstones.bulkPut(tombstones);

    const backup = await exportDatabase();
    expect(backup.version).toBe(11);
    expect(backup.tombstones).toEqual(expect.arrayContaining(tombstones));
    expect(validateBackup(backup)).toBe(true);

    await db.tombstones.clear();
    await importBackup(backup, 'replace');
    expect(await db.tombstones.toArray()).toEqual(expect.arrayContaining(tombstones));
  });

  it('imports a v9 backup with no tombstones array', async () => {
    const v9 = emptyBackup({ version: 9, tombstones: undefined });
    expect(validateBackup(v9)).toBe(true);
    await importBackup(v9, 'replace');
    expect(await db.tombstones.count()).toBe(0);
  });

  it('unions incoming tombstones on merge without applying them as deletes', async () => {
    await db.courses.add({
      id: 'still-here',
      name: 'Kept',
      description: '',
      createdAt: 1,
      updatedAt: 1,
      fsrsVersion: 6,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      unlockMode: 'open',
      autoPractice: false,
      practiceThresholdMinutesFar: 8,
      practiceThresholdMinutesNear: 4,
      practiceUrgentWindowDays: 14,
      practiceMaxGap: 2,
    });
    await db.tombstones.add({ table: 'cards', recordId: 'local', deletedAt: 10 });

    await importBackup(
      emptyBackup({
        tombstones: [
          { table: 'cards', recordId: 'local', deletedAt: 5 },
          { table: 'cards', recordId: 'remote', deletedAt: 20 },
        ],
      }),
      'merge',
    );

    expect(await db.courses.get('still-here')).toMatchObject({ name: 'Kept' });
    expect(await db.tombstones.toArray()).toEqual(
      expect.arrayContaining([
        { table: 'cards', recordId: 'local', deletedAt: 10 },
        { table: 'cards', recordId: 'remote', deletedAt: 20 },
      ]),
    );
  });
});
