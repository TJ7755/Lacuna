import { describe, expect, it } from 'vitest';
import type { Card, ReviewLog, RevisionPlan } from '@lacuna/core/db/types';
import { estimateRemainingWork } from './remainingWork';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { simContext } from '../fsrs/forwardSim';
import { makeEngine } from '../fsrs/fsrs';
const NOW = Date.parse('2026-11-01T12:00:00Z');
const DAY = 86_400_000;
function makeCard(over: Partial<Card> & Pick<Card, 'id'>): Card {
  return {
    conceptId: `concept-${over.id}`,
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: 'q',
    back: 'a',
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
    tags: [],
    suspended: false,
    buriedUntil: null,
    ...over,
  };
}

function review(timestamp: number): ReviewLog {
  return {
    timestamp,
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 3,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
}

describe('remaining assessment workload', () => {
  it('reports reference-target shortfalls without inventing reviews or changing due dates', () => {
    const cards = [
      makeCard({ id: 'secure', lastReviewed: NOW, due: NOW + 10 * DAY, stability: 1000 }),
      makeCard({ id: 'unstarted', due: null }),
      makeCard({ id: 'weak', lastReviewed: NOW, due: NOW + 10 * DAY, stability: 0.01 }),
      makeCard({ id: 'excluded', suspended: true }),
    ];
    const before = structuredClone(cards);
    const fsrsParameters = defaultFsrsParameters();
    const context = simContext(
      { fsrsParameters } as Parameters<typeof simContext>[0],
      makeEngine(fsrsParameters),
    );
    const result = estimateRemainingWork(cards, NOW, NOW + DAY, undefined, context);
    expect(result?.recall).toMatchObject({ cards: 3, belowTarget: 2 });
    expect(result?.recall?.mean).toBeGreaterThan(0.3);
    expect(result?.recall?.mean).toBeLessThan(0.9);
    expect(cards).toEqual(before);
    expect(estimateRemainingWork(cards, NOW, NOW, undefined, context)).toBeNull();
  });
  it('counts overdue, future reviews and new cards once, excluding unavailable cards', () => {
    const cards = [
      makeCard({ id: 'new' }),
      makeCard({ id: 'overdue', lastReviewed: NOW - DAY, due: NOW - 1 }),
      makeCard({ id: 'future', lastReviewed: NOW - DAY, due: NOW + DAY }),
      makeCard({ id: 'after', lastReviewed: NOW - DAY, due: NOW + 3 * DAY }),
      makeCard({ id: 'suspended', suspended: true }),
      makeCard({ id: 'buried', buriedUntil: NOW + DAY }),
    ];
    expect(estimateRemainingWork(cards, NOW, NOW + 2 * DAY)).toMatchObject({
      overdue: 1,
      dueBeforeAssessment: 1,
      unstarted: 1,
      minutes: 2,
      dailyMinutes: 1,
      usesDefaultTiming: true,
      coverage: null,
    });
  });
  it('excludes assessments at or before now and reviews exactly at the deadline', () => {
    expect(estimateRemainingWork([], NOW, NOW)).toBeNull();
    expect(estimateRemainingWork([], NOW, NOW - 1)).toBeNull();
    expect(
      estimateRemainingWork(
        [makeCard({ id: 'boundary', lastReviewed: NOW - 1, due: NOW + DAY })],
        NOW,
        NOW + DAY,
      )?.minutes,
    ).toBe(0);
  });
  it('sums sparse remaining windows without reviving missed or completed budgets', () => {
    const cards = Array.from({ length: 100 }, (_, index) => makeCard({ id: String(index) }));
    const plan = {
      status: 'active',
      input: { timeZone: 'UTC' },
      windows: [
        { day: '2026-10-31', status: 'scheduled', budgetMinutes: 100 },
        { day: '2026-11-01', status: 'completed', budgetMinutes: 100 },
        { day: '2026-11-03', status: 'scheduled', budgetMinutes: 20 },
        { day: '2026-11-07', status: 'scheduled', budgetMinutes: 100 },
      ],
    } as RevisionPlan;
    expect(estimateRemainingWork(cards, NOW, NOW + 5 * DAY, plan)?.coverage).toBe(0.4);
    plan.windows = [];
    expect(estimateRemainingWork(cards, NOW, NOW + 5 * DAY, plan)).toMatchObject({
      coverage: 0,
      budgetSource: 'plan',
    });
  });
  it('subtracts elapsed active-window time and never creates negative capacity', () => {
    const cards = Array.from({ length: 20 }, (_, index) => makeCard({ id: String(index) }));
    const plan = {
      status: 'active',
      input: { timeZone: 'UTC' },
      windows: [
        { day: '2026-11-01', status: 'active', budgetMinutes: 10, startedAt: NOW - 5 * 60_000 },
      ],
    } as RevisionPlan;
    expect(estimateRemainingWork(cards, NOW, NOW + DAY, plan)?.coverage).toBe(0.5);
    plan.windows[0].startedAt = NOW - 20 * 60_000;
    expect(estimateRemainingWork(cards, NOW, NOW + DAY, plan)?.coverage).toBe(0);
  });
  it('uses recorded timing and prefers the plan budget over observed activity', () => {
    const cards = Array.from({ length: 10 }, (_, index) =>
      makeCard({
        id: String(index),
        history: [{ ...review(NOW - DAY), responseTimeSec: 60 }],
      }),
    );
    const plan = {
      status: 'active',
      input: { timeZone: 'UTC' },
      windows: [
        { day: '2026-11-01', status: 'scheduled', budgetMinutes: 2 },
        { day: '2026-11-02', status: 'scheduled', budgetMinutes: 2 },
      ],
    } as RevisionPlan;
    expect(estimateRemainingWork(cards, NOW, NOW + 2 * DAY, plan)).toMatchObject({
      minutes: 10,
      dailyMinutes: 5,
      coverage: 0.4,
      budgetSource: 'plan',
      usesDefaultTiming: false,
    });
    expect(estimateRemainingWork(cards, NOW, NOW + 2 * DAY)?.budgetSource).toBe('observed');
  });
});
