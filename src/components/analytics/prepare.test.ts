import { describe, it, expect } from 'vitest';
import {
  forecastSeries,
  globalTrajectorySeries,
  leechCountByCourse,
  overallRecall,
  reviewActivityFromHistory,
  reviewVolume,
  retentionByAge,
  studyTimeSeries,
  totalStudyMinutes,
} from './prepare';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import type { Card, Course, Grade, ReviewLog, SessionHistoryEntry } from '../../db/types';
import type { ReviewHistoryEntry } from '../../db/reviewHistory';
import { startOfDay } from '../../utils/datetime';
import { computeStudyStats, FORECAST_DAYS } from '../../fsrs/stats';

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors src/state/useCourseData.test.ts)
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & Pick<Course, 'id'>): Course {
  return {
    name: 'Test course',
    description: '',
    createdAt: 0,
    updatedAt: 0,
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

function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    conceptId: `concept-${overrides.id}`,
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
    updatedAt: 0,
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

describe('forecastSeries', () => {
  const now = new Date(2026, 9, 23, 12).getTime();
  const date = (offset: number, hour = 12) => new Date(2026, 9, 23 + offset, hour).getTime();
  const counts = (cards: Card[], days = 3) =>
    forecastSeries(cards, days, now).map(({ due, newCards }) => ({ due, newCards }));

  it('folds overdue reviews into today without losing future reviews', () => {
    const cards = [-2, 0, 1].map((offset) =>
      makeCard({ id: `due-${offset}`, deckId: 'd1', state: 2, due: date(offset) }),
    );
    expect(counts(cards)).toEqual([
      { due: 2, newCards: 0 },
      { due: 1, newCards: 0 },
      { due: 0, newCards: 0 },
    ]);
  });

  it('places new and due cards on their first available day', () => {
    const cards = [
      makeCard({ id: 'new', deckId: 'd1', buriedUntil: date(1) }),
      makeCard({ id: 'overdue', deckId: 'd1', due: date(-2), buriedUntil: date(1) }),
      makeCard({ id: 'later-due', deckId: 'd1', due: date(2), buriedUntil: date(1) }),
      makeCard({ id: 'expired-burial', deckId: 'd1', buriedUntil: now }),
      makeCard({ id: 'buried-today', deckId: 'd1', buriedUntil: date(0, 18) }),
    ];
    expect(counts(cards)).toEqual([
      { due: 0, newCards: 2 },
      { due: 1, newCards: 1 },
      { due: 1, newCards: 0 },
    ]);
  });

  it('excludes suspended cards and availability dates outside the window', () => {
    const cards = [
      makeCard({ id: 'suspended-new', deckId: 'd1', suspended: true }),
      makeCard({ id: 'suspended-due', deckId: 'd1', suspended: true, due: now }),
      makeCard({ id: 'later-new', deckId: 'd1', buriedUntil: date(3, 0) }),
      makeCard({ id: 'later-due', deckId: 'd1', due: date(3, 0) }),
      makeCard({ id: 'buried-due', deckId: 'd1', due: now, buriedUntil: date(3, 0) }),
    ];
    expect(counts(cards)).toEqual(Array.from({ length: 3 }, () => ({ due: 0, newCards: 0 })));
    expect(forecastSeries([], 0, now)).toEqual([]);
  });

  it('matches dashboard daily counts when budgets and buried new cards do not apply', () => {
    const cards = [
      makeCard({ id: 'new', deckId: 'd1' }),
      makeCard({ id: 'overdue', deckId: 'd1', state: 2, due: date(-2) }),
      makeCard({ id: 'buried', deckId: 'd2', state: 2, due: now, buriedUntil: date(2) }),
      makeCard({ id: 'future', deckId: 'd2', state: 2, due: date(6) }),
    ];
    const dashboard = computeStudyStats(cards, new Map(), now).forecast;
    expect(counts(cards, FORECAST_DAYS)).toEqual(
      dashboard.map(({ dueCount, newCount }) => ({ due: dueCount, newCards: newCount })),
    );
  });

  it('retains uncapped workload when the dashboard applies a source budget', () => {
    const cards = [
      makeCard({ id: 'due', deckId: 'd1', courseId: 'c1', state: 2, due: now }),
      makeCard({ id: 'new', deckId: 'd1', courseId: 'c1' }),
    ];
    const dashboard = computeStudyStats(
      cards,
      new Map(),
      now,
      undefined,
      undefined,
      new Map([['c1', makeCourse({ id: 'c1', maxReviewsPerDay: 1 })]]),
    ).forecast;
    expect(counts(cards)[0]).toEqual({ due: 1, newCards: 1 });
    expect(dashboard[0]).toMatchObject({ dueCount: 1, newCount: 0 });
  });
});

describe('leechCountByCourse', () => {
  it('groups leeches by course name and ignores cards without a courseId', () => {
    const courseMap = new Map([
      ['c1', { name: 'Biology' }],
      ['c2', { name: 'Chemistry' }],
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

  it("uses each course's own leech threshold", () => {
    const courseMap = new Map([['c1', { name: 'Biology', leechThreshold: 3 }]]);
    const cards = [makeCard({ id: 'card1', deckId: 'd1', courseId: 'c1', lapses: 3, reps: 5 })];
    expect(leechCountByCourse(cards, courseMap)).toEqual([{ name: 'Biology', count: 1 }]);
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

describe('studyTimeSeries', () => {
  it('keeps short daily sessions instead of rounding each day to zero', () => {
    const now = Date.UTC(2026, 0, 10, 12);
    const day = 86_400_000;
    // Ten days of 20 seconds each: every day rounds to 0 whole minutes on its own.
    const history = Array.from({ length: 10 }, (_, i) => ({
      ...makeReview(now - i * day, 3),
      responseTimeSec: 20,
    }));
    const card = makeCard({ id: 'card1', deckId: 'd1', history });
    const series = studyTimeSeries([card], 30, now);

    expect(series.at(-1)?.minutes).toBeCloseTo(1 / 3);
    expect(totalStudyMinutes(series)).toBe(3);
  });

  it('reads any study as at least a minute, and none as zero', () => {
    const now = Date.UTC(2026, 0, 10, 12);
    const card = makeCard({ id: 'card1', deckId: 'd1', history: [makeReview(now, 3)] });

    expect(totalStudyMinutes(studyTimeSeries([card], 30, now))).toBe(1);
    expect(totalStudyMinutes(studyTimeSeries([], 30, now))).toBe(0);
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
    expect(point.courses).toBe(2);
  });
});

describe('overallRecall', () => {
  it('weights each age band by its review count', () => {
    expect(
      overallRecall([
        { ageLabel: 'a', retention: 100, count: 1 },
        { ageLabel: 'b', retention: 50, count: 3 },
        { ageLabel: 'c', retention: 0, count: 0 },
      ]),
    ).toBe(63);
  });

  it('is null before any review', () => {
    expect(overallRecall([{ ageLabel: 'a', retention: 0, count: 0 }])).toBeNull();
  });
});

describe('reviewActivityFromHistory', () => {
  it('groups review timestamps by card', () => {
    const entry = (cardId: string, timestamp: number) =>
      ({ cardId, timestamp }) as ReviewHistoryEntry;
    const activity = reviewActivityFromHistory([entry('a', 1), entry('b', 2), entry('a', 3)]);
    expect(activity.get('a')).toEqual([1, 3]);
    expect(activity.get('b')).toEqual([2]);
  });
});
