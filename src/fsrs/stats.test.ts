import { describe, expect, it } from 'vitest';
import { computeStudyStats, DEFAULT_REVIEW_SECONDS, FORECAST_DAYS } from './stats';
import { MS_PER_DAY } from './params';
import { startOfDay } from '../utils/datetime';
import type { Card, ReviewLog } from '../db/types';

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
    deckId: 'd1',
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
});

describe('computeStudyStats — 7-day time forecast', () => {
  it('produces one bucket per forecast day', () => {
    const { forecast } = computeStudyStats([], new Map(), NOW);
    expect(forecast).toHaveLength(FORECAST_DAYS);
    expect(forecast[0].dayStart).toBe(TODAY);
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

  it('excludes suspended and never-reviewed cards, and cards beyond the window', () => {
    const cards = [
      card({ suspended: true, due: NOW }),
      card({ due: null, lastReviewed: null }),
      card({ due: NOW + 30 * MS_PER_DAY }),
    ];
    const { forecast } = computeStudyStats(cards, new Map(), NOW);
    expect(forecast.reduce((s, d) => s + d.dueCount, 0)).toBe(0);
  });
});
