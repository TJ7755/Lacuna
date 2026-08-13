import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, createLesson } from './repository';
import { db } from './schema';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  findBackingDeck,
  findBackingDecks,
  performanceForReviewUnit,
  removeCourseSchedulingUnits,
  removeLessonSchedulingUnit,
  restoreReviewUnitPerformance,
  updateReviewUnitPerformance,
} from './backingDecks';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('scheduling-unit access', () => {
  it('resolves Course-bank and Lesson units without creating hidden stores', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    expect(await ensureCourseBankBackingDeck(course.id)).toBe(course.id);
    expect(await ensureLessonBackingDeck(course.id, lesson.id)).toBe(lesson.id);
    expect(await findBackingDeck(course.id, null)).toMatchObject({
      id: course.id,
      kind: 'course',
    });
    expect(await findBackingDeck(course.id, lesson.id)).toMatchObject({
      id: lesson.id,
      kind: 'lesson',
    });
  });

  it('bulk-resolves only units owned by the Course', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const other = await createCourse('Chemistry');
    const units = await findBackingDecks(course.id, [lesson.id, other.id]);

    expect([...units.keys()]).toEqual([null, lesson.id]);
  });

  it('updates and exactly restores scheduling performance', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const before = await performanceForReviewUnit(lesson.id);
    const updated = await updateReviewUnitPerformance(lesson.id, 4);
    expect(updated).toMatchObject({ runningMeanResponseTime: 4, totalCorrectReviews: 1 });

    await restoreReviewUnitPerformance(lesson.id, before ?? null);
    expect(await performanceForReviewUnit(lesson.id)).toEqual(before);
  });

  it('removes Lesson and Course target rows', async () => {
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Genetics');

    await removeLessonSchedulingUnit(first.id);
    expect(await db.schedulingUnits.get(first.id)).toBeUndefined();
    await removeCourseSchedulingUnits(course.id, [second.id]);
    expect(await db.schedulingUnits.bulkGet([course.id, second.id])).toEqual([undefined, undefined]);
    expect(await db.coursePerformance.get(course.id)).toBeUndefined();
  });
});
