import { describe, expect, it } from 'vitest';
import type { Card, Course, CourseAssessment, ReviewLog } from '../db/types';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from '../fsrs/params';
import { courseHeaderStats } from './headerStats';

const NOW = Date.UTC(2026, 5, 4, 10);

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course',
    name: 'Test course',
    description: '',
    createdAt: 0,
    examDate: NOW + 30 * MS_PER_DAY,
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

function makeExamDate(id: string, examDate: number): CourseAssessment {
  return {
    id,
    courseId: 'course',
    name: id,
    kind: 'checkpoint',
    examDate,
    coverageMode: 'prefix',
    afterLessonId: null,
    excludedCardIds: [],
    createdAt: 0,
  };
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    deckId: 'course',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
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

function review(timestamp: number): ReviewLog {
  return {
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

describe('courseHeaderStats', () => {
  it('passes mastery through and reports the nearest exam and its urgency', () => {
    const course = makeCourse();
    const examDates = [
      makeExamDate('later', NOW + 10 * MS_PER_DAY),
      makeExamDate('nearest', NOW + 2 * MS_PER_DAY),
      makeExamDate('past', NOW - MS_PER_DAY),
    ];

    expect(courseHeaderStats(course, examDates, [], 0.73, NOW)).toEqual({
      nearestExam: NOW + 2 * MS_PER_DAY,
      examUrgent: true,
      mastery: 0.73,
      dueCardCount: 0,
    });
  });

  it('counts overdue reviews and only the new cards admitted by the daily cap', () => {
    const cards = [
      makeCard('due', { state: 2, due: NOW - 1 }),
      makeCard('future', { state: 2, due: NOW + MS_PER_DAY }),
      makeCard('new-oldest', { createdAt: 1 }),
      makeCard('new-next', { createdAt: 2 }),
      makeCard('new-capped', { createdAt: 3 }),
    ];

    expect(
      courseHeaderStats(makeCourse({ newCardsPerDay: 2 }), [], cards, 0, NOW).dueCardCount,
    ).toBe(3);
  });

  it('subtracts cards introduced recently from the remaining new-card budget', () => {
    const cards = [
      makeCard('introduced', {
        state: 2,
        due: NOW + MS_PER_DAY,
        history: [review(NOW - 1_000)],
      }),
      makeCard('new-oldest', { createdAt: 1 }),
      makeCard('new-capped', { createdAt: 2 }),
    ];

    expect(
      courseHeaderStats(makeCourse({ newCardsPerDay: 2 }), [], cards, 0, NOW).dueCardCount,
    ).toBe(1);
  });

  it('excludes suspended, future-buried and future review cards', () => {
    const cards = [
      makeCard('due', { state: 2, due: NOW }),
      makeCard('suspended', { state: 2, due: NOW, suspended: true }),
      makeCard('buried', { state: 2, due: NOW, buriedUntil: NOW + MS_PER_DAY }),
      makeCard('future', { state: 2, due: NOW + 1 }),
    ];

    expect(courseHeaderStats(makeCourse(), [], cards, 0, NOW).dueCardCount).toBe(1);
  });

  it('reports zero due cards for an archived course', () => {
    const cards = [makeCard('due', { state: 2, due: NOW }), makeCard('new')];

    expect(courseHeaderStats(makeCourse({ archived: true }), [], cards, 0, NOW).dueCardCount).toBe(
      0,
    );
  });
});
