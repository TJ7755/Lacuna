import { describe, expect, it } from 'vitest';
import { computeStudyStats, DEFAULT_REVIEW_SECONDS, FORECAST_DAYS } from './stats';
import { MS_PER_DAY } from './params';
import { startOfDay } from '../utils/datetime';
import type { Card, ReviewLog, SchedulerConfig } from '../db/types';

// A fixed local-noon reference so day bucketing is unambiguous.
const NOW = new Date(2026, 5, 4, 12, 0, 0).getTime();
const TODAY = startOfDay(NOW);

function review(timestamp: number): ReviewLog {
  return {
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: 1,
    stabilityAfter: 2,
    difficultyBefore: 5,
    difficultyAfter: 5,
    retrievabilityAtReview: 0.9,
  };
}

function card(over: Partial<Card> = {}): Card {
  return {
    id: Math.random().toString(36).slice(2),
    conceptId: 'concept-stats-card',
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: 'q',
    back: 'a',
    stability: 1,
    difficulty: 5,
    lastReviewed: NOW,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('computeStudyStats — streak', () => {
  it('counts consecutive days ending today', () => {
    const c = card({
      history: [
        review(TODAY + 1000),
        review(TODAY - MS_PER_DAY + 1000),
        review(TODAY - 2 * MS_PER_DAY + 1000),
      ],
    });
    const { streak } = computeStudyStats([c], new Map(), NOW);
    expect(streak).toBe(3);
  });

  it('still counts when today has no reviews but yesterday does', () => {
    const c = card({
      history: [review(TODAY - MS_PER_DAY + 1000), review(TODAY - 2 * MS_PER_DAY + 1000)],
    });
    expect(computeStudyStats([c], new Map(), NOW).streak).toBe(2);
  });

  it('is zero when the most recent review is older than yesterday', () => {
    const c = card({ history: [review(TODAY - 3 * MS_PER_DAY)] });
    expect(computeStudyStats([c], new Map(), NOW).streak).toBe(0);
  });
});

describe('computeStudyStats — reviewed today', () => {
  it('counts only reviews dated today', () => {
    const c = card({
      history: [review(TODAY + 1000), review(TODAY + 2000), review(TODAY - MS_PER_DAY)],
    });
    expect(computeStudyStats([c], new Map(), NOW).reviewedToday).toBe(2);
  });

  it('uses canonical activity for the streak and reviewed-today count', () => {
    const c = card({ id: 'canonical-card', history: [review(TODAY - 10 * MS_PER_DAY)] });
    const activity = new Map([
      ['canonical-card', [TODAY + 1000, TODAY - MS_PER_DAY + 1000, TODAY - 2 * MS_PER_DAY + 1000]],
    ]);

    const stats = computeStudyStats([c], new Map(), NOW, undefined, activity);
    expect(stats.streak).toBe(3);
    expect(stats.reviewedToday).toBe(1);
  });

  it('does not fall back to stale card history when canonical activity is empty', () => {
    const c = card({
      id: 'canonical-card',
      history: [review(TODAY + 1000), review(TODAY - MS_PER_DAY + 1000)],
    });

    const stats = computeStudyStats([c], new Map(), NOW, undefined, new Map());
    expect(stats.streak).toBe(0);
    expect(stats.reviewedToday).toBe(0);
  });
});

describe('computeStudyStats — 7-day time forecast', () => {
  it('groups scheduling sources without rescanning every card for every source', () => {
    const sourceCount = 100;
    const cardsPerSource = 100;
    const sources = Array.from({ length: sourceCount }, (_, index) => `source-${index}`);
    const scheduling = new Map(
      sources.map((id) => [
        id,
        Object.freeze({ id, newCardsPerDay: 3, maxReviewsPerDay: 3 }) as SchedulerConfig,
      ]),
    );
    const deckSeconds = new Map(sources.map((id) => [id, 30]));
    const activity = new Map<string, readonly number[]>();
    const records = sources.flatMap((sourceId, sourceIndex) =>
      Array.from({ length: cardsPerSource }, (_, index) => {
        const id = `${sourceId}-card-${index}`;
        if (index === 0) activity.set(id, Object.freeze([NOW - 1_000]));
        return card({
          id,
          courseId: sourceIndex % 2 === 0 ? sourceId : null,
          schedulingUnitId: sourceIndex % 2 === 0 ? `unit-${sourceIndex}` : sourceId,
          due: index < 2 ? NOW : null,
          lastReviewed: index < 2 ? NOW : null,
          state: index < 2 ? 2 : 0,
          reps: index < 2 ? 1 : 0,
          createdAt: NOW + index,
          suspended: index === 2,
          buriedUntil: index === 3 ? NOW + MS_PER_DAY : null,
        });
      }),
    );
    const originalRecords = structuredClone(records);
    const originalScheduling = structuredClone(scheduling);
    const originalDeckSeconds = structuredClone(deckSeconds);
    const originalActivity = structuredClone(activity);
    let sourceReads = 0;
    const cards = records.map((record) => {
      Object.freeze(record.history);
      Object.freeze(record);
      return new Proxy(record, {
        get(target, property, receiver) {
          if (property === 'courseId' || property === 'schedulingUnitId') sourceReads += 1;
          return Reflect.get(target, property, receiver);
        },
      });
    });
    Object.freeze(cards);

    const stats = computeStudyStats(cards, deckSeconds, NOW, undefined, activity, scheduling);
    const measuredSourceReads = sourceReads;

    expect(stats).toEqual({
      streak: 1,
      reviewedToday: sourceCount,
      forecast: Array.from({ length: FORECAST_DAYS }, (_, index) => ({
        dayStart: TODAY + index * MS_PER_DAY,
        dueCount: index === 0 ? sourceCount * 2 : 0,
        newCount: index === 0 ? sourceCount : 0,
        minutes: index === 0 ? sourceCount * 1.5 : 0,
        byDeck:
          index === 0
            ? sources.map((sourceId) => ({ sourceId, dueCount: 2, newCount: 1, minutes: 1.5 }))
            : [],
      })),
    });
    expect(cards).toEqual(originalRecords);
    expect(scheduling).toEqual(originalScheduling);
    expect(deckSeconds).toEqual(originalDeckSeconds);
    expect(activity).toEqual(originalActivity);
    // Count actual source reads rather than relying on machine-dependent timings.
    expect(measuredSourceReads).toBeLessThanOrEqual(cards.length * 8);
  });

  it('respects each course daily new-card and review limits', () => {
    const cards = [
      ...Array.from({ length: 4 }, (_, index) =>
        card({ id: `due-${index}`, courseId: 'french', due: NOW }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        card({
          id: `new-${index}`,
          courseId: 'french',
          due: null,
          lastReviewed: null,
          state: 0,
          reps: 0,
          createdAt: NOW + index,
        }),
      ),
    ];
    const config = {
      id: 'french',
      newCardsPerDay: 2,
      maxReviewsPerDay: 5,
    } as SchedulerConfig;

    const { forecast } = computeStudyStats(
      cards,
      new Map(),
      NOW,
      undefined,
      undefined,
      new Map([['french', config]]),
    );

    expect(forecast[0]).toMatchObject({ dueCount: 4, newCount: 1 });
    expect(forecast[0].byDeck).toEqual([
      expect.objectContaining({ sourceId: 'french', dueCount: 4, newCount: 1 }),
    ]);
  });
  it('produces one bucket per forecast day', () => {
    const { forecast } = computeStudyStats([], new Map(), NOW);
    expect(forecast).toHaveLength(FORECAST_DAYS);
    expect(forecast[0].dayStart).toBe(TODAY);
  });

  it('filters only the forecast while retaining archived-course review history', () => {
    const reviewed = card({
      courseId: 'archived-course',
      due: NOW,
      history: [review(NOW - 1_000)],
    });

    const stats = computeStudyStats([reviewed], new Map(), NOW, new Set(['active-course']));

    expect(stats.reviewedToday).toBe(1);
    expect(stats.streak).toBe(1);
    expect(stats.forecast[0].dueCount).toBe(0);
  });

  it('folds overdue cards into today and uses the deck mean for minutes', () => {
    const deckSeconds = new Map([['d1', 30]]); // 30s per card
    const cards = [
      card({ due: NOW - 5 * MS_PER_DAY }), // overdue → today
      card({ due: NOW + MS_PER_DAY }), // tomorrow
    ];
    const { forecast } = computeStudyStats(cards, deckSeconds, NOW);
    expect(forecast[0].dueCount).toBe(1);
    expect(forecast[0].minutes).toBeCloseTo(30 / 60);
    expect(forecast[1].dueCount).toBe(1);
  });

  it('falls back to the default per-review time without calibration', () => {
    const { forecast } = computeStudyStats([card({ due: NOW })], new Map(), NOW);
    expect(forecast[0].minutes).toBeCloseTo(DEFAULT_REVIEW_SECONDS / 60);
  });

  it('excludes suspended and cards beyond the window, but counts never-reviewed cards as new today', () => {
    const cards = [
      card({ suspended: true, due: NOW }),
      card({ due: null, lastReviewed: null, state: 0, reps: 0 }),
      card({ due: NOW + 30 * MS_PER_DAY }),
    ];
    const { forecast } = computeStudyStats(cards, new Map(), NOW);
    expect(forecast[0].newCount).toBe(1);
    expect(forecast[0].dueCount).toBe(0); // new cards are tracked separately
    expect(forecast.reduce((s, d) => s + d.dueCount, 0)).toBe(0);
  });

  it('groups forecast by course or scheduling-unit source', () => {
    const cards = [
      card({ schedulingUnitId: 'd1', due: NOW }),
      card({ schedulingUnitId: 'd2', due: NOW }),
      card({ schedulingUnitId: 'd1', due: NOW + MS_PER_DAY }),
    ];
    const { forecast } = computeStudyStats(cards, new Map(), NOW);
    expect(forecast[0].byDeck).toHaveLength(2);
    // No courseId is set, so sourceId is the scheduling-unit id.
    expect(forecast[0].byDeck.find((d) => d.sourceId === 'd1')?.dueCount).toBe(1);
    expect(forecast[0].byDeck.find((d) => d.sourceId === 'd2')?.dueCount).toBe(1);
    expect(forecast[1].byDeck.find((d) => d.sourceId === 'd1')?.dueCount).toBe(1);
  });
});
