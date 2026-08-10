import { describe, expect, it } from 'vitest';
import type { Card, Course, CourseAssessment, Lesson, LessonCardExposure } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import { assessmentPracticeOptions, assessmentPracticePool } from './assessmentPractice';

const NOW = 1_000_000;

function course(): Course {
  return {
    id: 'course',
    name: 'Course',
    description: '',
    createdAt: 0,
    examDate: NOW + 30 * MS_PER_DAY,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: true,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 2,
  };
}

function lesson(id: string, orderIndex: number): Lesson {
  return { id, courseId: 'course', name: id, orderIndex, createdAt: 0, isExtension: false };
}

function card(id: string, lessonId: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    deckId: 'deck',
    courseId: 'course',
    primaryLessonId: lessonId,
    type: 'front_back',
    front: id,
    back: id,
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

function assessment(
  id: string,
  examDate: number,
  lessonIds: string[],
  excludedCardIds: string[] = [],
): CourseAssessment {
  return {
    id,
    courseId: 'course',
    name: id,
    kind: id === 'final' ? 'final' : 'checkpoint',
    examDate,
    afterLessonId: 'l3',
    coverageMode: 'custom',
    lessonIds,
    excludedCardIds,
    createdAt: 0,
  };
}

function exposure(lessonId: string, cardId: string): LessonCardExposure {
  return { lessonId, cardId, taughtAt: NOW };
}

describe('assessment Practice resolution', () => {
  const lessons = [lesson('l1', 0), lesson('l2', 1), lesson('l3', 2)];
  const cards = [card('c1', 'l1'), card('c2', 'l2'), card('c3', 'l3')];
  const exposures = cards.map((item) => exposure(item.primaryLessonId!, item.id));

  it('returns only future, urgent assessments intersecting the trigger scope, ordered by date', () => {
    const options = assessmentPracticeOptions(
      {
        course: course(),
        assessments: [
          assessment('later', NOW + 5 * MS_PER_DAY, ['l1']),
          assessment('unrelated', NOW + MS_PER_DAY, ['l3']),
          assessment('nearer', NOW + 2 * MS_PER_DAY, ['l1', 'l2']),
          assessment('past', NOW - 1, ['l1']),
          assessment('far', NOW + 10 * MS_PER_DAY, ['l1']),
        ],
        lessons,
        cards,
        links: [],
        exposures,
        reachedLessonIds: new Set(['l1', 'l2', 'l3']),
        now: NOW,
      },
      [cards[0]],
    );

    expect(options.map((option) => option.assessmentId)).toEqual(['nearer', 'later']);
  });

  it('expands a selected assessment to its full reached and exposed scope', () => {
    const extra = card('c2-extra', 'l2');
    const target = assessment('paper', NOW + 2 * MS_PER_DAY, ['l1', 'l2', 'l3'], ['c2']);
    const pool = assessmentPracticePool(target, {
      course: course(),
      lessons,
      cards: [cards[0], cards[1], extra, { ...cards[2], suspended: true }],
      links: [],
      exposures: [...exposures, exposure('l2', extra.id)],
      reachedLessonIds: new Set(['l1', 'l2', 'l3']),
      now: NOW,
    });

    expect(pool.map((item) => item.id)).toEqual(['c1', 'c2-extra']);
  });

  it('does not leak unreached or unexposed assessment cards into revision', () => {
    const target = assessment('paper', NOW + 2 * MS_PER_DAY, ['l1', 'l2', 'l3']);
    const pool = assessmentPracticePool(target, {
      course: course(),
      lessons,
      cards,
      links: [],
      exposures: [exposure('l1', 'c1')],
      reachedLessonIds: new Set(['l1', 'l2']),
      now: NOW,
    });

    expect(pool.map((item) => item.id)).toEqual(['c1']);
  });
});
