import { describe, expect, it } from 'vitest';
import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../db/types';
import { resolveAssessmentCoverage } from './assessmentCoverage';

const lessons: Lesson[] = ['one', 'two', 'three'].map((id, orderIndex) => ({
  id,
  courseId: 'course',
  name: id,
  orderIndex,
  isExtension: false,
  createdAt: orderIndex,
}));

function assessment(overrides: Partial<CourseAssessment> = {}): CourseAssessment {
  return {
    id: 'assessment',
    courseId: 'course',
    name: 'Assessment',
    kind: 'checkpoint',
    examDate: 100,
    afterLessonId: 'two',
    coverageMode: 'prefix',
    excludedCardIds: [],
    createdAt: 0,
    ...overrides,
  } as CourseAssessment;
}

function card(id: string, primaryLessonId: string | null): Card {
  return {
    id,
    deckId: 'deck',
    courseId: 'course',
    primaryLessonId,
    type: 'front_back',
    front: id,
    back: id,
    stability: 1,
    difficulty: 5,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
  };
}

describe('resolveAssessmentCoverage', () => {
  it('expands prefix coverage through the independent placement anchor', () => {
    const result = resolveAssessmentCoverage(assessment(), lessons, [], []);

    expect(result.placementIndex).toBe(1);
    expect(result.coveredLessons.map((lesson) => lesson.id)).toEqual(['one', 'two']);
  });

  it('resolves non-contiguous custom coverage independently of placement', () => {
    const result = resolveAssessmentCoverage(
      assessment({ coverageMode: 'custom', lessonIds: ['one', 'three'], afterLessonId: 'three' }),
      lessons,
      [],
      [],
    );

    expect(result.coveredLessons.map((lesson) => lesson.id)).toEqual(['one', 'three']);
    expect(result.validation.valid).toBe(true);
  });

  it('keeps placement attached to the anchor when lessons reorder', () => {
    const reordered = lessons.map((lesson) => ({
      ...lesson,
      orderIndex: lesson.id === 'two' ? 0 : lesson.id === 'one' ? 1 : 2,
    }));
    const result = resolveAssessmentCoverage(assessment(), reordered, [], []);

    expect(result.placementIndex).toBe(0);
    expect(result.coveredLessons.map((lesson) => lesson.id)).toEqual(['two']);
  });

  it('rejects a custom lesson positioned after the assessment', () => {
    const result = resolveAssessmentCoverage(
      assessment({ coverageMode: 'custom', lessonIds: ['three'] }),
      lessons,
      [],
      [],
    );

    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({ code: 'custom-lesson-after-assessment', referenceId: 'three' }),
    );
  });

  it('uses linked membership, deduplicates cards and applies exclusions', () => {
    const cards = [card('primary', 'one'), card('linked', 'three')];
    const links: LessonCardLink[] = [
      { id: 'link-one', lessonId: 'one', cardId: 'linked', createdAt: 0 },
      { id: 'link-two', lessonId: 'two', cardId: 'linked', createdAt: 1 },
    ];
    const result = resolveAssessmentCoverage(
      assessment({ excludedCardIds: ['primary'] }),
      lessons,
      cards,
      links,
    );

    expect(result.cards.map((coveredCard) => coveredCard.id)).toEqual(['linked']);
    expect(result.validation.valid).toBe(true);
  });

  it('keeps overlapping assessments independent', () => {
    const cards = [card('first', 'one'), card('third', 'three')];
    const prefix = resolveAssessmentCoverage(
      assessment({ afterLessonId: 'one' }),
      lessons,
      cards,
      [],
    );
    const custom = resolveAssessmentCoverage(
      assessment({
        id: 'other',
        coverageMode: 'custom',
        lessonIds: ['three'],
        afterLessonId: 'three',
      }),
      lessons,
      cards,
      [],
    );

    expect(prefix.cards.map((coveredCard) => coveredCard.id)).toEqual(['first']);
    expect(custom.cards.map((coveredCard) => coveredCard.id)).toEqual(['third']);
  });

  it('reports stale and cross-course references for author confirmation', () => {
    const foreignLesson = { ...lessons[0], id: 'foreign', courseId: 'other' };
    const foreignCard = { ...card('foreign-card', 'foreign'), courseId: 'other' };
    const result = resolveAssessmentCoverage(
      assessment({
        afterLessonId: 'missing-anchor',
        coverageMode: 'custom',
        lessonIds: ['missing-lesson', 'foreign'],
        excludedCardIds: ['missing-card', 'foreign-card'],
      }),
      [...lessons, foreignLesson],
      [foreignCard],
      [],
    );

    expect(result.validation.needsAuthorConfirmation).toBe(true);
    expect(result.validation.issues.map((issue) => issue.code)).toEqual([
      'missing-placement-lesson',
      'missing-covered-lesson',
      'cross-course-covered-lesson',
      'missing-excluded-card',
      'cross-course-excluded-card',
    ]);
  });

  it('resolves an unanchored final assessment to cover every lesson', () => {
    const result = resolveAssessmentCoverage(
      assessment({ kind: 'final', afterLessonId: null }),
      lessons,
      [],
      [],
    );

    expect(result.placementIndex).toBe(lessons.length - 1);
    expect(result.coveredLessons.map((lesson) => lesson.id)).toEqual(['one', 'two', 'three']);
  });

  it('leaves an unanchored checkpoint covering no lessons (before all lessons)', () => {
    const result = resolveAssessmentCoverage(
      assessment({ kind: 'checkpoint', afterLessonId: null }),
      lessons,
      [],
      [],
    );

    expect(result.placementIndex).toBe(-1);
    expect(result.coveredLessons).toEqual([]);
  });
});
