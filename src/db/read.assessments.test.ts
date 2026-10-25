import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createPracticeNode,
  linkCardToLesson,
} from './repository';
import {
  listCourseAssessments,
  listCourseAssessmentDetails,
  getCourseAssessmentDetails,
} from './read';
import { clearAll } from './read.testFixtures';

describe('assessment reads', () => {
  beforeEach(clearAll);

  afterEach(() => vi.restoreAllMocks());

  describe('practice nodes / assessments', () => {
    it('scopes practice nodes and assessments to their course', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const node = await createPracticeNode(course.id, { type: 'manual', name: 'Practice 1' });
      await createPracticeNode(otherCourse.id, { type: 'manual', name: 'Other practice' });

      const now = Date.now();
      const examDate = await createCourseAssessment(course.id, 'Mid-term', now + 1000);
      await createCourseAssessment(otherCourse.id, 'Other exam', now + 2000);

      expect(
        (await db.practiceNodes.where('courseId').equals(course.id).toArray()).map((n) => n.id),
      ).toEqual([node.id]);
      expect((await listCourseAssessments(course.id)).map((e) => e.id)).toContain(examDate.id);
    });

    it('returns empty lists for a course with none', async () => {
      const course = await createCourse('Course A');
      expect(await db.practiceNodes.where('courseId').equals(course.id).toArray()).toEqual([]);
      expect(await listCourseAssessments(course.id)).toHaveLength(1);
    });
  });

  it('resolves all assessments from one course snapshot without loading review history', async () => {
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
    const expected = await Promise.all(
      (await listCourseAssessments(course.id)).map((assessment) =>
        getCourseAssessmentDetails(assessment.id),
      ),
    );
    const cards = vi.spyOn(db.cards, 'where');
    const lessons = vi.spyOn(db.lessons, 'where');
    const history = vi.spyOn(db.reviewHistory, 'where');
    const globalLinks = vi.spyOn(db.lessonCards, 'toArray');
    const links = vi.spyOn(db.lessonCards, 'where');

    const actual = await listCourseAssessmentDetails(course.id);
    expect(actual).toEqual(expected);
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
    expect(cards).toHaveBeenCalledTimes(1);
    expect(lessons).toHaveBeenCalledTimes(1);
    expect(history).not.toHaveBeenCalled();
    expect(globalLinks).not.toHaveBeenCalled();
    expect(links).toHaveBeenCalledExactlyOnceWith('lessonId');
  });
});
