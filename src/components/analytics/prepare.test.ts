import { describe, it, expect } from 'vitest';
import {
  globalTrajectorySeries,
  leechCountByCourse,
  lessonBreakdown,
  reviewVolume,
  retentionByAge,
} from './prepare';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import type { Card, Course, Grade, Lesson, ReviewLog, SessionHistoryEntry } from '../../db/types';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';
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
    schedulingUnitId: overrides.schedulingUnitId ?? overrides.deckId ?? 'unit',
  };
}

function makeReview(timestamp: number, grade: Grade): ReviewLog {
  return {
    timestamp,
    grade,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: 1,
    stabilityAfter: 2,
    difficultyBefore: 5,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
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
      makeCard({
        id: 'card1',
        deckId: 'd1',
        schedulingUnitId: 'd1',
        courseId: 'c1',
        primaryLessonId: 'l1',
        lastReviewed: 100,
      }),
      makeCard({
        id: 'card2',
        deckId: 'd1',
        schedulingUnitId: 'd1',
        courseId: 'c1',
        primaryLessonId: 'l1',
        lastReviewed: null,
      }),
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
    const cards = [makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', primaryLessonId: 'l1' })];
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
        schedulingUnitId: 'd1',
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

describe('retentionByAge', () => {
  it('counts every review at the card age when it happened', () => {
    const day = 86_400_000;
    const firstReview = Date.UTC(2026, 0, 1);
    const card = makeCard({
      id: 'card1',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      // Deliberately out of order: card history must not make age depend on array order.
      history: [
        makeReview(firstReview + 10 * day, 3),
        makeReview(firstReview, 1),
        makeReview(firstReview + 3 * day, 3),
        makeReview(firstReview + 31 * day, 1),
      ],
    });

    const result = retentionByAge([card], firstReview + 40 * day);

    expect(result.find((point) => point.ageLabel === '0–7 days')).toMatchObject({
      retention: 50,
      count: 2,
    });
    expect(result.find((point) => point.ageLabel === '7–30 days')).toMatchObject({
      retention: 100,
      count: 1,
    });
    expect(result.find((point) => point.ageLabel === '30–90 days')).toMatchObject({
      retention: 0,
      count: 1,
    });
  });

  it('uses canonical event rows when the card projection is stale', () => {
    const day = 86_400_000;
    const firstReview = Date.UTC(2026, 0, 1);
    const card = makeCard({ id: 'card1', deckId: 'd1', history: [] });
    const reviewHistory: ReviewHistoryEntry[] = [
      {
        ...makeReview(firstReview, 3),
        id: 'review:event:canonical',
        cardId: card.id,
        deckId: card.deckId,
        schedulingUnitId: card.deckId,
      },
      {
        ...makeReview(firstReview + 10 * day, 1),
        id: 'review:event:canonical-2',
        cardId: card.id,
        deckId: card.deckId,
        schedulingUnitId: card.deckId,
      },
    ];

    const result = retentionByAge([card], firstReview + 20 * day, reviewHistory);

    expect(result.find((point) => point.ageLabel === '0–7 days')?.count).toBe(1);
    expect(result.find((point) => point.ageLabel === '7–30 days')).toMatchObject({
      retention: 0,
      count: 1,
    });
  });
});

describe('reviewVolume', () => {
  it('counts canonical event rows when the card projection is empty', () => {
    const timestamp = Date.UTC(2026, 0, 1, 12);
    const card = makeCard({ id: 'card1', deckId: 'd1', history: [] });
    const event: ReviewHistoryEntry = {
      ...makeReview(timestamp, 3),
      id: 'review:event:volume',
      cardId: card.id,
      deckId: card.deckId,
      schedulingUnitId: card.deckId,
    };

    expect(reviewVolume([card], 1, timestamp, [event])[0].reviews).toBe(1);
  });
});

describe('globalTrajectorySeries', () => {
  it('averages the last per-course snapshot for each day', () => {
    const day = startOfDay(Date.UTC(2026, 0, 15));
    const history: SessionHistoryEntry[] = [
      {
        timestamp: day + 1000,
        deckId: 'd1',
        schedulingUnitId: 'd1',
        courseId: 'c1',
        averagePredictedRetrievability: 0.8,
      },
      {
        timestamp: day + 2000,
        deckId: 'd2',
        schedulingUnitId: 'd2',
        courseId: 'c1',
        averagePredictedRetrievability: 0.9,
      },
      {
        timestamp: day + 1500,
        deckId: 'd3',
        schedulingUnitId: 'd3',
        courseId: 'c2',
        averagePredictedRetrievability: 0.6,
      },
      {
        timestamp: day + 500,
        deckId: 'legacy',
        schedulingUnitId: 'legacy',
        averagePredictedRetrievability: 0.1,
      },
    ];
    const [point] = globalTrajectorySeries(history);
    expect(point.retrievability).toBe(75);
  });
});
