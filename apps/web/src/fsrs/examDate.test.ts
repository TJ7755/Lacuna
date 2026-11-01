import { describe, it, expect } from 'vitest';
import { makeExamDateContext, resolveCardExamDate } from './examDate';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Card, Course, CourseAssessment, Lesson } from '../db/types';
import type { Concept } from '../questions/types';
import { cardSchedulingHorizon } from './horizon';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';

const NOW = 1_000_000_000_000;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course1',
    name: 'Course',
    description: '',
    createdAt: NOW,
    updatedAt: NOW,
    examDate: NOW + 100 * MS_PER_DAY,
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

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson1',
    courseId: 'course1',
    name: 'Lesson',
    orderIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
    isExtension: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    conceptId: 'concept-c1',
    deckId: 'd1',
    schedulingUnitId: 'd1',
    courseId: 'course1',
    primaryLessonId: 'lesson1',
    type: 'front_back',
    front: 'q',
    back: 'a',
    stability: 2,
    difficulty: 5,
    lastReviewed: NOW,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW + MS_PER_DAY,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeExamDate(overrides: Partial<CourseAssessment> = {}): CourseAssessment {
  const coverage = overrides.lessonIds
    ? { coverageMode: 'custom' as const, lessonIds: overrides.lessonIds }
    : { coverageMode: 'prefix' as const };
  return {
    id: 'ed1',
    courseId: 'course1',
    name: 'Checkpoint',
    kind: 'checkpoint',
    examDate: NOW + 50 * MS_PER_DAY,
    ...coverage,
    afterLessonId: 'lesson1',
    excludedCardIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as CourseAssessment;
}

describe('resolveCardExamDate', () => {
  it('uses the lesson override and ignores a sooner checkpoint', () => {
    const lessonExam = NOW + 80 * MS_PER_DAY;
    const lesson = makeLesson({ examDate: lessonExam });
    const checkpoint = makeExamDate({ examDate: NOW + 10 * MS_PER_DAY });
    const ctx = makeExamDateContext(makeCourse(), [lesson], [checkpoint]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(lessonExam);
  });

  it('uses the lesson override even when it is in the past', () => {
    const lessonExam = NOW - 5 * MS_PER_DAY;
    const lesson = makeLesson({ examDate: lessonExam });
    const checkpoint = makeExamDate({ examDate: NOW + 10 * MS_PER_DAY });
    const ctx = makeExamDateContext(makeCourse(), [lesson], [checkpoint]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(lessonExam);
  });

  it('chooses the nearest future checkpoint among several', () => {
    const near = makeExamDate({ id: 'near', examDate: NOW + 20 * MS_PER_DAY });
    const far = makeExamDate({ id: 'far', examDate: NOW + 60 * MS_PER_DAY });
    const lesson = makeLesson(); // no override
    const ctx = makeExamDateContext(makeCourse(), [lesson], [far, near]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(near.examDate);
  });

  it('ignores passed checkpoints and falls through to the next future one', () => {
    const passed = makeExamDate({ id: 'passed', examDate: NOW - MS_PER_DAY });
    const future = makeExamDate({ id: 'future', examDate: NOW + 30 * MS_PER_DAY });
    const ctx = makeExamDateContext(makeCourse(), [makeLesson()], [passed, future]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(future.examDate);
  });

  it('falls back to the course exam date when all checkpoints have passed', () => {
    const course = makeCourse({ examDate: NOW + 100 * MS_PER_DAY });
    const passed = makeExamDate({ examDate: NOW - MS_PER_DAY });
    const ctx = makeExamDateContext(course, [makeLesson()], [passed]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(course.examDate);
  });

  it('skips a checkpoint that excludes the card and uses the next applicable date', () => {
    const course = makeCourse();
    const excluding = makeExamDate({
      id: 'excluding',
      examDate: NOW + 10 * MS_PER_DAY,
      excludedCardIds: ['c1'],
    });
    const other = makeExamDate({ id: 'other', examDate: NOW + 40 * MS_PER_DAY });
    const ctx = makeExamDateContext(course, [makeLesson()], [excluding, other]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(other.examDate);
  });

  it('skips a checkpoint whose lessonIds do not cover the card', () => {
    const course = makeCourse();
    const otherLessonOnly = makeExamDate({
      examDate: NOW + 10 * MS_PER_DAY,
      lessonIds: ['lessonX'],
    });
    const ctx = makeExamDateContext(course, [makeLesson()], [otherLessonOnly]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(course.examDate);
  });

  it('includes the card when the checkpoint scopes its lesson', () => {
    const scoped = makeExamDate({
      examDate: NOW + 10 * MS_PER_DAY,
      lessonIds: ['lesson1'],
    });
    const ctx = makeExamDateContext(makeCourse(), [makeLesson()], [scoped]);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(scoped.examDate);
  });

  it('uses linked lesson membership for a card with no primary lesson', () => {
    const course = makeCourse();
    const checkpoint = makeExamDate({ examDate: NOW + 15 * MS_PER_DAY });
    const ctx = makeExamDateContext(
      course,
      [makeLesson({ examDate: NOW + 1 })],
      [checkpoint],
      [{ id: 'link', lessonId: 'lesson1', cardId: 'c1', createdAt: NOW, updatedAt: NOW }],
    );
    const card = makeCard({ primaryLessonId: null });
    expect(resolveCardExamDate(card, ctx, NOW)).toBe(checkpoint.examDate);
  });

  it('does not apply prefix coverage to lessons after the placement anchor', () => {
    const course = makeCourse();
    const checkpoint = makeExamDate({ afterLessonId: 'lesson1' });
    const laterLesson = makeLesson({ id: 'lesson2', orderIndex: 1 });
    const ctx = makeExamDateContext(course, [makeLesson(), laterLesson], [checkpoint]);

    expect(resolveCardExamDate(makeCard({ primaryLessonId: 'lesson2' }), ctx, NOW)).toBe(
      course.examDate,
    );
  });

  it('uses the course exam date when there are no checkpoints', () => {
    const course = makeCourse({ examDate: NOW + 42 * MS_PER_DAY });
    const ctx = makeExamDateContext(course, [makeLesson()], []);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(course.examDate);
  });

  it('advances shared knowledge through its papers and maintains recall after the last one', () => {
    const course = makeCourse({
      specificationRef: paperSpecificationReference,
      specificationData: paperSpecification,
      examDate: NOW + 20 * MS_PER_DAY,
    });
    const first = makeExamDate({
      coverageMode: 'specification',
      specificationPaperId: 'paper-1',
      examDate: NOW + 10 * MS_PER_DAY,
    });
    const final = makeExamDate({
      id: 'final',
      kind: 'final',
      coverageMode: 'specification',
      specificationPaperId: 'paper-2',
      examDate: course.examDate,
    });
    const card = makeCard();
    const concept: Concept = {
      id: card.conceptId,
      scope: 'course',
      courseId: course.id,
      scopeKey: `course:${course.id}`,
      name: 'Cells',
      provisional: false,
      createdAt: NOW,
      updatedAt: NOW,
      specificationPointIds: ['example-science:cells'],
    };
    const ctx = makeExamDateContext(course, [makeLesson()], [final, first], [], [concept]);

    expect(resolveCardExamDate(card, ctx, NOW)).toBe(first.examDate);
    expect(resolveCardExamDate(card, ctx, first.examDate!)).toBe(first.examDate);
    expect(resolveCardExamDate(card, ctx, first.examDate! + 1)).toBe(final.examDate);
    const afterFinal = final.examDate! + 1;
    expect(resolveCardExamDate(card, ctx, afterFinal)).toBeUndefined();
    expect(cardSchedulingHorizon(card, course, ctx, afterFinal)).toBe(afterFinal + 7 * MS_PER_DAY);
  });

  it('does not target an unrelated final after a Card has finished its own paper', () => {
    const course = makeCourse({
      specificationRef: paperSpecificationReference,
      specificationData: paperSpecification,
      examDate: NOW + 20 * MS_PER_DAY,
    });
    const first = makeExamDate({
      coverageMode: 'specification',
      specificationPaperId: 'paper-1',
      examDate: NOW + 10 * MS_PER_DAY,
    });
    const final = makeExamDate({
      id: 'final',
      kind: 'final',
      coverageMode: 'specification',
      specificationPointIds: ['example-science:enzymes'],
      examDate: course.examDate,
    });
    const cards = [
      makeCard(),
      makeCard({ id: 'enzymes', conceptId: 'enzymes' }),
      makeCard({ id: 'unlinked', conceptId: 'unlinked' }),
    ];
    const concepts: Concept[] = ['cells', 'enzymes'].map((point, index) => ({
      id: cards[index].conceptId,
      scope: 'course',
      courseId: course.id,
      scopeKey: `course:${course.id}`,
      name: point,
      provisional: false,
      createdAt: NOW,
      updatedAt: NOW,
      specificationPointIds: [`example-science:${point}`],
    }));
    const ctx = makeExamDateContext(course, [makeLesson()], [first, final], [], concepts);

    expect(cards.map((card) => resolveCardExamDate(card, ctx, NOW))).toEqual([
      first.examDate,
      final.examDate,
      undefined,
    ]);
    const betweenPapers = first.examDate! + 1;
    expect(resolveCardExamDate(cards[0], ctx, betweenPapers)).toBeUndefined();
    expect(cardSchedulingHorizon(cards[0], course, ctx, betweenPapers)).toBe(
      betweenPapers + 7 * MS_PER_DAY,
    );
    const laterTest = makeExamDate({ id: 'school-test', examDate: NOW + 30 * MS_PER_DAY });
    expect(
      resolveCardExamDate(
        cards[1],
        makeExamDateContext(course, [makeLesson()], [laterTest, final], [], concepts),
        NOW,
      ),
    ).toBe(final.examDate);
  });
});
