import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, createLesson, createLessonCard } from './repository';
import { buildCourseSharePayload } from './shareCoursePayload';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { reset } from './share.testFixtures';

beforeEach(reset);

it.each([2, 3, 4, 5] as const)(
  'rejects v%s at both direct lineage boundaries without writes',
  async (version) => {
    const course = await createCourse('Existing course');
    const lesson = await createLesson(course.id, 'Existing lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    const current = await buildCourseSharePayload(course.id);
    const old: unknown = { ...current, v: version, li: 'old-lineage', rv: 1 };
    const snapshot = () =>
      Promise.all(db.tables.map(async (table) => [table.name, await table.toArray()]));
    const before = await snapshot();
    await expect(
      importLineageFirstTime(old as Parameters<typeof importLineageFirstTime>[0]),
    ).rejects.toThrow('unsupported old version');
    expect(await snapshot()).toEqual(before);
    await expect(
      mergeLineageUpdate(course.id, old as Parameters<typeof mergeLineageUpdate>[1]),
    ).rejects.toThrow('unsupported old version');
    expect(await snapshot()).toEqual(before);
  },
);
