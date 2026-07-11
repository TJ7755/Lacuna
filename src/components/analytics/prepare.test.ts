import { describe, it, expect } from 'vitest';
import { globalTrajectorySeries, leechCountByCourse, lessonBreakdown } from './prepare';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import type { Card, Course, Lesson, SessionHistoryEntry } from '../../db/types';
import { startOfDay } from '../../utils/datetime';

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors src/state/useCourseData.test.ts)
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
    practiceThresholdMinutesFar: 60,
    practiceThresholdMinutesNear: 30,
    practiceUrgentWindowDays: 7,
    practiceMaxGap: 5,
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

describe('lessonBreakdown', () => {
  it('returns an empty array when there are no lessons', () => {
    expect(lessonBreakdown([], [], makeCourse({ id: 'c1' }))).toEqual([]);
  });

  it('groups cards by primaryLessonId and computes completion', () => {
    const course = makeCourse({ id: 'c1' });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1', name: 'Lesson one' });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1', lastReviewed: 100 }),
      makeCard({ id: 'card2', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1', lastReviewed: null }),
    ];
    const [entry] = lessonBreakdown([lesson], cards, course);
    expect(entry.lessonId).toBe('l1');
    expect(entry.name).toBe('Lesson one');
    expect(entry.cardCount).toBe(2);
    expect(entry.completionPct).toBe(50);
  });

  it('excludes extension lessons', () => {
    const course = makeCourse({ id: 'c1' });
    const extensionLesson = makeLesson({ id: 'l1', courseId: 'c1', isExtension: true });
    const cards = [
      makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' }),
    ];
    expect(lessonBreakdown([extensionLesson], cards, course)).toEqual([]);
  });

  it('gives a lesson with no cards a fully-mastered entry rather than omitting it', () => {
    // An empty card set is treated as fully mastered, matching the course-level
    // progressValue convention (Addendum 2 §J), not hardcoded to zero.
    const course = makeCourse({ id: 'c1' });
    const lesson = makeLesson({ id: 'l1', courseId: 'c1' });
    const [entry] = lessonBreakdown([lesson], [], course);
    expect(entry.cardCount).toBe(0);
    expect(entry.masteryPct).toBe(100);
    expect(entry.completionPct).toBe(0);
  });
});

describe('leechCountByCourse', () => {
  it('groups leeches by course name and ignores cards without a courseId', () => {
    const courseMap = new Map([
      ['c1', 'Biology'],
      ['c2', 'Chemistry'],
    ]);
    const cards = [
      makeCard({
        id: 'card1',
        deckId: 'd1',
        courseId: 'c1',
        lapses: 8,
        reps: 10,
      }),
      makeCard({ id: 'card2', deckId: 'd2', courseId: 'c2', lapses: 9, reps: 10 }),
      makeCard({ id: 'card3', deckId: 'd3', lapses: 2, reps: 2 }),
    ];
    const result = leechCountByCourse(cards, courseMap);
    expect(result).toEqual([
      { name: 'Biology', count: 1 },
      { name: 'Chemistry', count: 1 },
    ]);
  });
});

describe('globalTrajectorySeries', () => {
  it('averages the last per-course snapshot for each day', () => {
    const day = startOfDay(Date.UTC(2026, 0, 15));
    const history: SessionHistoryEntry[] = [
      {
        timestamp: day + 1000,
        deckId: 'd1',
        courseId: 'c1',
        averagePredictedRetrievability: 0.8,
      },
      {
        timestamp: day + 2000,
        deckId: 'd2',
        courseId: 'c1',
        averagePredictedRetrievability: 0.9,
      },
      {
        timestamp: day + 1500,
        deckId: 'd3',
        courseId: 'c2',
        averagePredictedRetrievability: 0.6,
      },
      {
        timestamp: day + 500,
        deckId: 'legacy',
        averagePredictedRetrievability: 0.1,
      },
    ];
    const [point] = globalTrajectorySeries(history);
    expect(point.retrievability).toBe(75);
  });
});
