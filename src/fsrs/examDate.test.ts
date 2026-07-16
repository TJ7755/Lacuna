import { describe, it, expect } from 'vitest';
import { makeExamDateContext, resolveCardExamDate } from './examDate';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Card, Course, CourseAssessment, Lesson } from '../db/types';

const NOW = 1_000_000_000_000;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course1',
    name: 'Course',
    description: '',
    createdAt: NOW,
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
    isExtension: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
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
    afterLessonId: null,
    excludedCardIds: [],
    createdAt: NOW,
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

  it('skips the lesson override step for a card with no primary lesson', () => {
    const course = makeCourse();
    // An unscoped checkpoint (all lessons) still applies to a lessonless card.
    const unscoped = makeExamDate({ examDate: NOW + 15 * MS_PER_DAY });
    const lessonScoped = makeExamDate({
      id: 'scoped',
      examDate: NOW + 5 * MS_PER_DAY,
      lessonIds: ['lesson1'],
    });
    const ctx = makeExamDateContext(
      course,
      [makeLesson({ examDate: NOW + 1 })],
      [lessonScoped, unscoped],
    );
    const card = makeCard({ primaryLessonId: null });
    // Lesson override skipped; lesson-scoped checkpoint skipped; unscoped wins.
    expect(resolveCardExamDate(card, ctx, NOW)).toBe(unscoped.examDate);
  });

  it('uses the course exam date when there are no checkpoints', () => {
    const course = makeCourse({ examDate: NOW + 42 * MS_PER_DAY });
    const ctx = makeExamDateContext(course, [makeLesson()], []);
    expect(resolveCardExamDate(makeCard(), ctx, NOW)).toBe(course.examDate);
  });
});
