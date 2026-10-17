import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courses from './courseRepository';
import { db } from './schema';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Course specification reference', () => {
  it('sets and clears a reference without losing Custom fallback text', async () => {
    const course = await courses.createCourse('Biology', {
      examBoard: 'Custom board',
      specification: 'Custom syllabus',
    });
    const reference = {
      specificationId: 'unbundled-board-fixture',
      tier: 'higher',
      routeIds: ['route.b'],
    };
    const now = vi.spyOn(Date, 'now').mockReturnValue(course.updatedAt + 100);
    try {
      await courses.setCourseSpecificationReference(course.id, reference);
      expect(await db.courses.get(course.id)).toMatchObject({
        specificationRef: reference,
        examBoard: 'Custom board',
        specification: 'Custom syllabus',
        updatedAt: course.updatedAt + 100,
      });
      await courses.setCourseSpecificationReference(course.id, undefined);
      expect(await db.courses.get(course.id)).toMatchObject({
        examBoard: 'Custom board',
        specification: 'Custom syllabus',
      });
      expect((await db.courses.get(course.id))?.specificationRef).toBeUndefined();
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    { specificationId: 'Bad id' },
    { specificationId: 'board-fixture', tier: '' },
    { specificationId: 'board-fixture', routeIds: ['route', 'route'] },
    { specificationId: 'board-fixture', routeIds: ['BAD'] },
  ])('rejects malformed references at every authoring boundary: %j', async (invalid) => {
    const course = await courses.createCourse('Biology');
    const before = await db.courses.get(course.id);
    const reference = invalid as never;
    await expect(courses.setCourseSpecificationReference(course.id, reference)).rejects.toThrow();
    await expect(
      courses.updateCourse(course.id, { specificationRef: reference, name: 'Invalid' }),
    ).rejects.toThrow();
    await expect(
      courses.createCourse('Invalid', { specificationRef: reference }),
    ).rejects.toThrow();
    expect(await db.courses.get(course.id)).toEqual(before);
    expect(await db.courses.count()).toBe(1);
  });

  it('rejects missing Courses and edits to a locked published copy', async () => {
    await expect(courses.setCourseSpecificationReference('missing', undefined)).rejects.toThrow(
      /not.*found/i,
    );
    const course = await courses.createCourse('Biology');
    await db.courses.update(course.id, {
      distributedCopy: {
        lineageId: 'teacher',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    const before = await db.courses.get(course.id);
    const reference = { specificationId: 'example-specification' };
    await expect(courses.setCourseSpecificationReference(course.id, reference)).rejects.toThrow(
      /locked/i,
    );
    await expect(courses.updateCourse(course.id, { specificationRef: reference })).rejects.toThrow(
      /locked/i,
    );
    expect(await db.courses.get(course.id)).toEqual(before);
  });
});
