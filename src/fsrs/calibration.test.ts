import { describe, expect, it } from 'vitest';
import type { Card, Grade, ReviewLog } from '../db/types';
import { predictionAccuracySeries, gradeQualitySummary } from './calibration';

const DAY = new Date(2026, 5, 4, 12).getTime();

function log(
  grade: Grade,
  retrievabilityAtReview: number | null,
  responseTimeSec: number,
  offset = 0,
): ReviewLog {
  return {
    timestamp: DAY + offset,
    grade,
    responseTimeSec,
    distracted: false,
    stabilityBefore: 1,
    stabilityAfter: 2,
    difficultyBefore: 5,
    difficultyAfter: 5,
    retrievabilityAtReview,
  };
}

function card(history: ReviewLog[]): Card {
  return {
    id: Math.random().toString(36).slice(2),
    deckId: 'd1',
    type: 'front_back',
    front: 'q',
    back: 'a',
    stability: 1,
    difficulty: 5,
    lastReviewed: DAY,
    reps: history.length,
    lapses: history.filter((h) => h.grade === 1).length,
    state: 2,
    due: DAY,
    scheduledDays: 1,
    learningSteps: 0,
    history,
    createdAt: DAY,
  };
}

describe('predictionAccuracySeries', () => {
  it('computes daily Brier score against recall outcomes', () => {
    const series = predictionAccuracySeries([
      card([log(3, 0.8, 2), log(1, 0.25, 9, 1_000), log(3, null, 3, 2_000)]),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0].reviews).toBe(2);
    expect(series[0].predicted).toBeCloseTo(0.525);
    expect(series[0].actual).toBeCloseTo(0.5);
    expect(series[0].brier).toBeCloseTo(((0.8 - 1) ** 2 + (0.25 - 0) ** 2) / 2);
  });
});

describe('gradeQualitySummary', () => {
  it('reports grade spread and faster-response next-recall lift', () => {
    const summary = gradeQualitySummary([
      card([
        log(4, 0.9, 1),
        log(3, 0.8, 5),
        log(2, 0.7, 9),
        log(1, 0.4, 12),
      ]),
    ]);

    expect(summary.gradeCounts).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 });
    expect(summary.totalReviews).toBe(4);
    expect(summary.fasterResponseRecallLift).toBe(0.5);
  });
});
