import { describe, expect, it } from 'vitest';
import frozenCoefficients from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';
import { revisionReplanReasons } from '../course/revisionPlan';
import type { Card, RevisionPlanInputSnapshot } from '../db/types';
import {
  createHalfLifeLogisticModel,
  loadHalfLifeLogisticCoefficients,
  projectionForHalfLifeLogistic,
  readinessFromPredictions,
} from './halfLifeLogisticModel';
import { forgettingCurve } from './forwardSim';

const REVIEWED_AT = Date.UTC(2026, 6, 1, 12);

function card(partial: Partial<Card> = {}): Card {
  return {
    id: 'card',
    deckId: 'deck',
    type: 'front_back',
    front: 'Front',
    back: 'Back',
    stability: 3,
    difficulty: 5,
    lastReviewed: REVIEWED_AT,
    reps: 1,
    lapses: 0,
    state: 2,
    due: REVIEWED_AT,
    scheduledDays: 1,
    learningSteps: 0,
    history: [
      {
        timestamp: REVIEWED_AT,
        grade: 3,
        correct: true,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 3,
        difficultyBefore: null,
        difficultyAfter: 5,
        retrievabilityAtReview: null,
      },
    ],
    createdAt: 0,
    ...partial,
  };
}

describe('half-life-logistic-v1 runtime', () => {
  it('matches offline reference values and blends smoothly into ordinary FSRS', () => {
    const model = createHalfLifeLogisticModel(-0.5);
    expect(model).toBeDefined();
    if (!model) return;

    expect(
      model.predictRecall({ card: card(), at: REVIEWED_AT + 3_600_000 }).probability,
    ).toBeCloseTo(0.9148754014047971, 12);
    expect(
      model.simulateOutcome({
        card: card(),
        cardAfterFsrs: card({ state: 3, stability: 1.5, lastReviewed: REVIEWED_AT + 1_000 }),
        outcome: 'failure',
        grade: 1,
        now: REVIEWED_AT + 1_000,
        assessmentAt: REVIEWED_AT + 3_601_000,
        predictAt: REVIEWED_AT + 3_601_000,
      }).probability,
    ).toBeCloseTo(0.7652395806630387, 12);

    const sixAndHalfDays = REVIEWED_AT + 561_600_000;
    expect(model.predictRecall({ card: card(), at: sixAndHalfDays }).probability).toBeCloseTo(
      0.8519156674477582,
      12,
    );
    expect(
      model.predictRecall({ card: card(), at: REVIEWED_AT + 604_800_000 }).probability,
    ).toBeCloseTo(forgettingCurve(7, 3, -0.5), 12);
  });

  it('validates missing, corrupt and unsupported artefacts without inventing values', () => {
    expect(loadHalfLifeLogisticCoefficients(undefined)).toEqual({
      valid: false,
      reason: 'missing',
    });
    const corrupt = structuredClone(frozenCoefficients);
    corrupt.coefficients[0] = Number.NaN;
    expect(loadHalfLifeLogisticCoefficients(corrupt)).toEqual({ valid: false, reason: 'corrupt' });
    const unsupported = structuredClone(frozenCoefficients);
    unsupported.probability_composition.fsrs_only_from_seconds = 700_000;
    expect(loadHalfLifeLogisticCoefficients(unsupported)).toEqual({
      valid: false,
      reason: 'unsupported',
    });
    expect(projectionForHalfLifeLogistic(undefined)).toMatchObject({
      projectionMode: 'fsrs-6-practice-fallback',
      fallbackReason: 'missing',
    });
    expect(projectionForHalfLifeLogistic(corrupt)).toMatchObject({
      projectionMode: 'fsrs-6-practice-fallback',
      fallbackReason: 'corrupt',
    });
    expect(projectionForHalfLifeLogistic(unsupported)).toMatchObject({
      projectionMode: 'fsrs-6-practice-fallback',
      fallbackReason: 'unsupported',
    });
  });

  it('uses the global fit below 500 examples and exact shrinkage at the threshold', () => {
    const global = createHalfLifeLogisticModel(-0.5);
    const below = createHalfLifeLogisticModel(-0.5, frozenCoefficients, {
      scoredExamples: 499,
      intercept: 10,
      previousSuccess: 10,
      previousFailure: 10,
    });
    const threshold = createHalfLifeLogisticModel(-0.5, frozenCoefficients, {
      scoredExamples: 500,
      intercept: 10,
      previousSuccess: 10,
      previousFailure: 10,
    });
    const input = { card: card(), at: REVIEWED_AT + 3_600_000 };
    expect(below?.predictRecall(input)).toEqual(global?.predictRecall(input));
    expect(threshold?.predictRecall(input).probability).toBeGreaterThan(
      global?.predictRecall(input).probability ?? 1,
    );
  });

  it('marks unsupported card inputs for explicit allocator fallback', () => {
    const model = createHalfLifeLogisticModel(-0.5);
    expect(
      model?.validate({ card: card({ history: [] }), now: REVIEWED_AT, assessmentAt: REVIEWED_AT }),
    ).toEqual({ valid: false, reason: 'unsupported' });
    expect(
      model?.validate({
        card: card(),
        now: REVIEWED_AT - 1,
        assessmentAt: REVIEWED_AT + 1,
      }),
    ).toEqual({ valid: false, reason: 'unsupported' });
  });

  it('aggregates readiness only when every prediction carries valid uncertainty', () => {
    const readiness = readinessFromPredictions([
      { probability: 0.8, standardDeviation: 0.2 },
      { probability: 0.6, standardDeviation: 0.1 },
    ]);
    expect(readiness?.probability).toBeCloseTo(0.7, 12);
    expect(readiness?.standardDeviation).toBeCloseTo(Math.sqrt(0.05) / 2, 12);
    expect(readinessFromPredictions([{ probability: 0.8 }])).toBeNull();
  });

  it('changes the explained plan revision when the model version changes', () => {
    const changedCoefficients = structuredClone(frozenCoefficients);
    changedCoefficients.coefficients[0] += 0.001;
    const firstProjection = projectionForHalfLifeLogistic(frozenCoefficients);
    const changedProjection = projectionForHalfLifeLogistic(changedCoefficients);
    expect(firstProjection).toMatchObject({ projectionMode: 'memory-model' });
    expect(changedProjection).toMatchObject({ projectionMode: 'memory-model' });
    expect(changedProjection.memoryModelVersion).not.toBe(firstProjection.memoryModelVersion);
    const input: RevisionPlanInputSnapshot = {
      coverageVersion: 'coverage',
      deadlineAt: REVIEWED_AT + 86_400_000,
      reachedLessonIds: ['lesson'],
      exposureVersion: 'exposure',
      availabilityVersion: 'available',
      reviewEvidenceVersion: 'reviews',
      projection: firstProjection,
    };
    expect(
      revisionReplanReasons(input, {
        ...input,
        projection: changedProjection,
      }),
    ).toEqual(['memory-model-changed']);
  });
});
