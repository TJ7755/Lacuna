import { describe, it, expect } from 'vitest';
import { computeCourseSummaries } from './useCourseData';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import type { Card, Course, CourseAssessment, Lesson } from '../db/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    name: 'Test course',
    description: '',
    createdAt: 0,
    examDate: 7 * 24 * 60 * 60 * 1000,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 12,
    practiceThresholdMinutesNear: 6,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 3,
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson> & Pick<Lesson, 'id' | 'courseId'>): Lesson {
  return {
    name: 'Test lesson',
    orderIndex: 0,
    createdAt: 0,
    isExtension: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    type: 'front_back',
    front: '',
    back: '',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeCourseSummaries', () => {
  it('returns an empty record when there are no courses', () => {
    expect(computeCourseSummaries([], [], [])).toEqual({});
  });

  it('counts core cards correctly', () => {
    const course = makeCourse({ id: 'c1' });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1' });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
      makeCard({ id: 'card2', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
      makeCard({ id: 'card3', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
    ];
    const summaries = computeCourseSummaries([course], [lesson], cards);
    expect(summaries['c1'].cardCount).toBe(3);
    expect(summaries['c1'].unreviewed).toBe(3);
    expect(summaries['c1'].eligible).toBe(3);
  });

  it('excludes extension-lesson cards from all summary counts', () => {
    const course = makeCourse({ id: 'c1' });
    const coreLesson = makeLesson({ id: 'l1', courseId: 'c1', isExtension: false });
    const extLesson = makeLesson({ id: 'l2', courseId: 'c1', isExtension: true });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
      makeCard({ id: 'card2', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
      makeCard({ id: 'card3', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l2' }),
    ];
    const summaries = computeCourseSummaries([course], [coreLesson, extLesson], cards);
    expect(summaries['c1'].cardCount).toBe(2);
    expect(summaries['c1'].unreviewed).toBe(2);
    expect(summaries['c1'].eligible).toBe(2);
  });

  it('includes cards with null primaryLessonId in summary counts', () => {
    const course = makeCourse({ id: 'c1' });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1' });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
      makeCard({ id: 'card2', deckId: 'd1', courseId: 'c1', primaryLessonId: null }),
    ];
    const summaries = computeCourseSummaries([course], [lesson], cards);
    expect(summaries['c1'].cardCount).toBe(2);
    expect(summaries['c1'].unreviewed).toBe(2);
  });

  it('counts only non-extension lessons in lessonCount', () => {
    const course = makeCourse({ id: 'c1' });
    const lessons = [
      makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0, isExtension: false }),
      makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1, isExtension: false }),
      makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2, isExtension: true }),
    ];
    const summaries = computeCourseSummaries([course], lessons, []);
    expect(summaries['c1'].lessonCount).toBe(2);
  });

  it('does not create a summary entry for orphaned card sets', () => {
    const course = makeCourse({ id: 'c1' });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1' }),
      makeCard({ id: 'card2', deckId: 'd1', courseId: 'c-orphan' }),
    ];
    const summaries = computeCourseSummaries([course], [], cards);
    expect(summaries['c-orphan']).toBeUndefined();
    expect(summaries['c1']).toBeDefined();
    expect(summaries['c1'].cardCount).toBe(1);
  });

  it("uses each card's applicable exam date for dashboard mastery", () => {
    const now = 20 * MS_PER_DAY;
    const course = makeCourse({
      id: 'c1',
      examDate: now + 30 * MS_PER_DAY,
      examObjective: 'expectedMarks',
    });
    const nearLesson = makeLesson({ id: 'near', courseId: 'c1' });
    const farLesson = makeLesson({ id: 'far', courseId: 'c1' });
    const cards = [
      makeCard({
        id: 'near-card',
        deckId: 'd1',
        courseId: 'c1',
        primaryLessonId: 'near',
        stability: 10,
        difficulty: 5,
        lastReviewed: 0,
        reps: 1,
        state: 2,
        due: now,
      }),
      makeCard({
        id: 'far-card',
        deckId: 'd1',
        courseId: 'c1',
        primaryLessonId: 'far',
        stability: 10,
        difficulty: 5,
        lastReviewed: 0,
        reps: 1,
        state: 2,
        due: now,
      }),
    ];
    const examDates: CourseAssessment[] = [
      {
        id: 'near-exam',
        courseId: 'c1',
        name: 'Near checkpoint',
        kind: 'checkpoint',
        examDate: now + 2 * MS_PER_DAY,
        coverageMode: 'custom',
        lessonIds: ['near'],
        afterLessonId: 'near',
        excludedCardIds: [],
        createdAt: 0,
      },
    ];
    const context = makeExamDateContext(course, [nearLesson, farLesson], examDates);

    const summary = computeCourseSummaries(
      [course],
      [nearLesson, farLesson],
      cards,
      examDates,
      now,
    )['c1'];

    expect(summary.mastery).toBeCloseTo(progressValue(cards, course, now, context), 12);
    expect(summary.mastery).not.toBeCloseTo(progressValue(cards, course, now), 6);
  });

  it('preserves the course-wide horizon when there are no exam-date overrides', () => {
    const now = 20 * MS_PER_DAY;
    const course = makeCourse({ id: 'c1', examDate: now + 7 * MS_PER_DAY });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1' });
    const card = makeCard({
      id: 'card1',
      deckId: 'd1',
      courseId: 'c1',
      primaryLessonId: 'l1',
      stability: 10,
      difficulty: 5,
      lastReviewed: 0,
      reps: 1,
      state: 2,
      due: now,
    });

    const summary = computeCourseSummaries([course], [lesson], [card], [], now)['c1'];

    expect(summary.mastery).toBeCloseTo(progressValue([card], course, now), 12);
  });
});
