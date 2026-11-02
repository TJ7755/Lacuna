import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse, updateCourse } from '../db/repository';
import { exportDatabase, importBackup } from '../db/portability';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from '../db/courseFile';
import { importSharePayload } from '../db/share';
import {
  addBuiltInTechniques,
  createCourseTechnique,
  setCourseTechniqueArchived,
  updateCourseTechnique,
} from './courseTechniques';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const stored = async (courseId: string) => (await db.courses.get(courseId))?.techniques;

describe('course technique catalogue', () => {
  it('starts empty and creates namespaced custom techniques with optional detail', async () => {
    const course = await createCourse('Physics');
    expect(await stored(course.id)).toBeUndefined();
    const technique = await createCourseTechnique(course.id, {
      name: '  Quote the data ',
      description: ' ',
    });
    expect(technique.id).toMatch(/^custom-/);
    expect(await stored(course.id)).toEqual([{ id: technique.id, name: 'Quote the data' }]);
    await expect(createCourseTechnique(course.id, { name: 'quote THE data' })).rejects.toThrow(
      'already exists',
    );
    await expect(createCourseTechnique(course.id, { name: '   ' })).rejects.toThrow('name');
    await updateCourseTechnique(course.id, technique.id, {
      name: 'Quote the data',
      description: 'Cite a value from the table.',
      example: 'At 30 °C the rate is 4.2 per minute.',
    });
    expect((await stored(course.id))![0]).toMatchObject({
      description: 'Cite a value from the table.',
      example: 'At 30 °C the rate is 4.2 per minute.',
    });
  });

  it('archives without deleting and restores built-ins rather than duplicating them', async () => {
    const course = await createCourse('Physics');
    await addBuiltInTechniques(course.id, ['substitution', 'causal-link']);
    await setCourseTechniqueArchived(course.id, 'substitution', true);
    expect(await stored(course.id)).toEqual([
      expect.objectContaining({ id: 'substitution', archived: true }),
      expect.objectContaining({ id: 'causal-link' }),
    ]);
    // A new technique may reuse an archived name; restoring the old one then conflicts.
    const replacement = await createCourseTechnique(course.id, { name: 'Substitute values' });
    await expect(addBuiltInTechniques(course.id, ['substitution'])).rejects.toThrow(
      'already exists',
    );
    await setCourseTechniqueArchived(course.id, replacement.id, true);
    await addBuiltInTechniques(course.id, ['substitution']);
    expect((await stored(course.id))!.filter((row) => row.id === 'substitution')).toEqual([
      expect.not.objectContaining({ archived: true }),
    ]);
    await expect(addBuiltInTechniques(course.id, ['invented'])).rejects.toThrow('Unknown');
  });

  it('rejects changes to locked and archived courses', async () => {
    const locked = await createCourse('Locked');
    await db.courses.update(locked.id, { 'distributedCopy.locked': true });
    await expect(createCourseTechnique(locked.id, { name: 'Any' })).rejects.toThrow('locked');
    const archived = await createCourse('Archived');
    await updateCourse(archived.id, { archived: true });
    await expect(addBuiltInTechniques(archived.id, ['substitution'])).rejects.toThrow('locked');
  });

  it('travels with backups and course files', async () => {
    const course = await createCourse('Physics');
    const technique = await createCourseTechnique(course.id, {
      name: 'Quote the data',
      description: 'Cite a value from the table.',
    });
    await addBuiltInTechniques(course.id, ['substitution']);
    const catalogue = await stored(course.id);
    await importBackup(await exportDatabase(), 'replace');
    expect(await stored(course.id)).toEqual(catalogue);
    const file = await decodeCourseFile(await buildCourseFile(course.id));
    await db.delete();
    await db.open();
    await withCourseFileAssets(file, () => importSharePayload(file.payload));
    const imported = (await db.courses.toArray())[0];
    expect(imported.techniques).toEqual(catalogue);
    expect(imported.techniques?.[0].id).toBe(technique.id);
  });
});
