import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Concept } from '@lacuna/core/questions/types';
import { db, ensurePreMigrationSnapshot } from './schema';
import { createCourse } from './repository';
import { exportDatabase, importBackup, readBackupFile, validateBackup } from './portability';
import type { BackupFile, MediaAsset } from '@lacuna/core/db/types';

const specificationRef = {
  specificationId: 'future-science-2099',
  tier: 'higher',
  routeIds: ['paper-5'],
  futureOptionalMetadata: { sourceIssue: 'Retain this additive metadata' },
};
const specificationPointIds = ['future-science-2099:enzymes.1', 'previous-science:density'];

async function linkedLibrary(): Promise<BackupFile> {
  const course = await createCourse('Science');
  const record = (await db.courses.get(course.id))!;
  await db.courses.put({
    ...record,
    updatedAt: 2,
    examBoard: 'Custom board',
    specification: 'Custom specification',
    specificationRef,
    distributedCopy: {
      lineageId: 'science-lineage',
      revision: 1,
      locked: false,
      autoAcceptUpdates: false,
      source: {
        name: 'Published science',
        description: 'Original course',
        unlockMode: 'open',
        examBoard: 'Source board',
        specification: 'Source specification',
        specificationRef,
      },
    },
  });
  const concept: Concept = {
    id: 'linked-concept',
    scope: 'course',
    scopeKey: `course:${course.id}`,
    courseId: course.id,
    name: 'Enzyme activity',
    provisional: false,
    createdAt: 1,
    updatedAt: 2,
    specificationPointIds,
  };
  await db.concepts.put(concept);
  return exportDatabase();
}

describe('specification backup portability', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.tables, () =>
      Promise.all(db.tables.map((table) => table.clear())),
    );
  });

  it.each(['replace', 'merge'] as const)(
    'preserves unknown catalogue references, older point links and source metadata through %s',
    async (mode) => {
      const backup = await linkedLibrary();
      const parsed = await readBackupFile(new File([JSON.stringify(backup)], 'science.json'));
      expect(parsed).toEqual(JSON.parse(JSON.stringify(backup)));
      expect(parsed.courses?.[0]).toMatchObject({ specificationRef });
      expect(parsed.concepts?.[0]).toMatchObject({ specificationPointIds });

      await db.courses.clear();
      await db.concepts.clear();
      await importBackup(parsed, mode);

      const restored = await exportDatabase();
      expect(restored.courses).toEqual(backup.courses);
      expect(restored.concepts).toEqual(backup.concepts);
    },
  );

  it.each([
    { field: 'specificationRef', value: { specificationId: '' } },
    { field: 'specificationRef', value: { specificationId: 'UPPERCASE' } },
    { field: 'specificationRef', value: { specificationId: 'science', tier: '' } },
    { field: 'specificationRef', value: { specificationId: 'science', routeIds: ['a', 'a'] } },
    { field: 'specificationPointIds', value: ['unqualified'] },
    { field: 'specificationPointIds', value: ['science:point:extra'] },
    { field: 'specificationPointIds', value: ['science:point', 'science:point'] },
    { field: 'specificationPointIds', value: [1] },
    { field: 'specificationRef', value: { specificationId: 'science', routeIds: new Array(1) } },
    { field: 'specificationPointIds', value: new Array(1) },
  ])('rejects malformed $field $value before any writes', async ({ field, value }) => {
    const backup = await linkedLibrary();
    const malformed =
      field === 'specificationRef'
        ? { ...backup, courses: [{ ...backup.courses![0], [field]: value }] }
        : { ...backup, concepts: [{ ...backup.concepts![0], [field]: value }] };
    const before = await Promise.all(db.tables.map((table) => table.toArray()));

    expect(validateBackup(malformed)).toBe(false);
    for (const mode of ['replace', 'merge'] as const) {
      await expect(importBackup(malformed as BackupFile, mode)).rejects.toThrow(
        'Invalid backup file.',
      );
    }
    expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
  });

  it('rejects specification links on legacy-scheduling-unit Concepts', async () => {
    const backup = await linkedLibrary();
    const malformed = {
      ...backup,
      concepts: [
        {
          ...backup.concepts![0],
          scope: 'legacy-scheduling-unit',
          scopeKey: 'legacy-scheduling-unit:legacy-unit',
          courseId: null,
          legacySchedulingUnitId: 'legacy-unit',
          provisional: true,
          specificationPointIds: [],
        },
      ],
    };

    expect(validateBackup(malformed)).toBe(false);
    await expect(importBackup(malformed as unknown as BackupFile, 'replace')).rejects.toThrow(
      'Invalid backup file.',
    );
  });

  it('validates stored distributed-course source specification metadata', async () => {
    const backup = await linkedLibrary();
    const course = backup.courses![0];
    const malformed = {
      ...backup,
      courses: [
        {
          ...course,
          distributedCopy: {
            ...course.distributedCopy!,
            source: {
              ...course.distributedCopy!.source!,
              specificationRef: { specificationId: '' },
            },
          },
        },
      ],
    };

    expect(validateBackup(malformed)).toBe(false);
  });

  it('validates and restores the v29 snapshot captured before the default v30 upgrade', async () => {
    const backup = await linkedLibrary();
    const name = `lacuna-specification-snapshot-${Date.now()}`;
    const media: MediaAsset[] = [
      {
        hash: 'snapshot-audio',
        blob: new Uint8Array([0, 1, 127, 128, 254, 255]),
        mimeType: 'audio/mpeg',
        kind: 'audio',
        createdAt: 3,
      },
      {
        hash: 'snapshot-image',
        blob: new Uint8Array([255, 128, 64, 1, 0]),
        mimeType: 'image/png',
        kind: 'image',
        width: 40,
        height: 30,
        createdAt: 4,
      },
    ];
    const legacy = new Dexie(name);
    legacy.version(29).stores({
      courses: 'id',
      concepts: 'id',
      courseAssessments: 'id',
      assets: 'hash',
    });
    await legacy.open();
    await legacy.table('courses').bulkAdd(backup.courses!);
    await legacy.table('concepts').bulkAdd(backup.concepts!);
    await legacy.table('courseAssessments').bulkAdd(backup.courseAssessments!);
    await legacy.table('assets').bulkAdd(media);
    legacy.close();
    let captured: BackupFile | undefined;
    try {
      await ensurePreMigrationSnapshot(name, undefined, async (targetVersion, snapshot) => {
        expect(targetVersion).toBe(31);
        captured = snapshot;
      });
      expect(captured).toMatchObject({ app: 'lacuna-v13', version: 13 });
      expect(captured!.assets.map((asset) => asset.kind)).toEqual(media.map((asset) => asset.kind));
      expect(validateBackup(captured)).toBe(true);
      await importBackup(captured!, 'replace');
      expect(await db.courses.toArray()).toEqual(backup.courses);
      expect(await db.concepts.toArray()).toEqual(backup.concepts);
      expect(await db.assets.bulkGet(media.map((asset) => asset.hash))).toEqual(media);
    } finally {
      await new Dexie(name).delete();
    }
  });
});
