import { describe, expect, it } from 'vitest';
import type { Card, ReviewLog, RevisionPlan } from '@lacuna/core/db/types';
import { estimateRemainingWork } from './remainingWork';
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
