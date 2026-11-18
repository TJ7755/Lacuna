import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  linkCardToLesson,
} from './repository';
import { listCourseAssessments, listCourseAssessmentDetails } from './read';
import { clearAll } from './read.testFixtures';

describe('assessment reads', () => {
  beforeEach(clearAll);

  it('returns only the requested course assessments, including its mandatory final', async () => {
    const course = await createCourse('Course A');
    const otherCourse = await createCourse('Course B');
    const now = Date.now();
    const checkpoint = await createCourseAssessment(course.id, 'Mid-term', now + 1000);
    await createCourseAssessment(otherCourse.id, 'Other exam', now + 2000);

    expect(await listCourseAssessments(course.id)).toEqual([
      expect.objectContaining({ id: checkpoint.id, courseId: course.id, kind: 'checkpoint' }),
      expect.objectContaining({ courseId: course.id, kind: 'final' }),
    ]);
  });

  it('resolves prefix, custom and final coverage including linked cards', async () => {
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Genetics');
    const card = await createLessonCard(course.id, second.id, 'front_back', 'q', 'a');
    await linkCardToLesson(first.id, card.id);
    await createCourseAssessment(course.id, 'Cells paper', 1000, { afterLessonId: first.id });
    await createCourseAssessment(course.id, 'Genetics paper', 2000, {
      afterLessonId: second.id,
      coverageMode: 'custom',
      lessonIds: [second.id],
    });
    const actual = await listCourseAssessmentDetails(course.id);
    expect(actual.slice(0, 2)).toMatchObject([
      {
        assessment: { name: 'Cells paper' },
        placementIndex: 0,
        coveredLessonIds: [first.id],
        cardIds: [card.id],
      },
      {
        assessment: { name: 'Genetics paper' },
        placementIndex: 1,
        coveredLessonIds: [second.id],
        cardIds: [card.id],
      },
    ]);
    expect(actual.every((detail) => detail.cardIds.includes(card.id))).toBe(true);
  });
});
