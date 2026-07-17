import { describe, expect, it } from 'vitest';
import frozenCoefficients from '../../tooling/short-term-memory/coefficients/half-life-logistic-v3.json';
import v1Coefficients from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';
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

describe('half-life-logistic-v3 runtime', () => {
  it('matches offline reference values and blends smoothly into ordinary FSRS', () => {
    const model = createHalfLifeLogisticModel(-0.5);
    expect(model).toBeDefined();
    if (!model) return;

    // First predictive review (reviewCount === 1) is routed onto the success/no-outcome
    // path regardless of the seed review's outcome, so this stays within the short-term-only
    // window (<= 21,600 s) exactly as it did under v1's single boundary.
    expect(
      model.predictRecall({ card: card(), at: REVIEWED_AT + 3_600_000 }).probability,
    ).toBeCloseTo(0.9148754014047971, 12);
    // simulateOutcome supplies a genuine previous outcome (failure) for a non-first review,
    // so this is routed onto the post-failure path; still short-term-only at 3,600 s
    // (<= 345,600 s under v3).
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

    // Six and a half days is still a first predictive review (reviewCount === 1), so it is
    // routed onto the success path, where the transition ends at 86,400 s: this is pure FSRS.
    const sixAndHalfDays = REVIEWED_AT + 561_600_000;
    expect(model.predictRecall({ card: card(), at: sixAndHalfDays }).probability).toBeCloseTo(
      forgettingCurve(6.5, 3, -0.5),
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

  it('rejects a v1-shaped probability_composition (missing routed fields)', () => {
    // v1's artefact also carries the old `candidate` name, so it is rejected earlier
    // (corrupt) than the composition check; force past that to exercise the composition
    // validation specifically.
    const v1WithV3Name = { ...structuredClone(v1Coefficients), candidate: 'half-life-logistic-v3-routed' };
    expect(loadHalfLifeLogisticCoefficients(v1WithV3Name)).toEqual({
      valid: false,
      reason: 'unsupported',
    });
  });

  it('routes the short-term weight by previous outcome at the boundary seconds', () => {
    const model = createHalfLifeLogisticModel(-0.5);
    expect(model).toBeDefined();
    if (!model) return;

    // Post-failure path: a second review (not first predictive) after a previous failure.
    const failureHistory = card({
      history: [
        {
          timestamp: REVIEWED_AT,
          grade: 1,
          correct: false,
          responseTimeSec: 4,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 3,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
        {
          timestamp: REVIEWED_AT - 1,
          grade: 1,
          correct: false,
          responseTimeSec: 4,
          distracted: false,
          stabilityBefore: null,
          stabilityAfter: 3,
          difficultyBefore: null,
          difficultyAfter: 5,
          retrievabilityAtReview: null,
        },
      ],
    });
    const postFailureAtBoundary = model.predictRecall({
      card: failureHistory,
      at: REVIEWED_AT + 345_600_000,
    }).probability;
    const postFailureJustPast = model.predictRecall({
      card: failureHistory,
      at: REVIEWED_AT + 345_601_000,
    }).probability;
    expect(postFailureAtBoundary).toBeGreaterThan(postFailureJustPast);
    expect(
      model.predictRecall({ card: failureHistory, at: REVIEWED_AT + 604_800_000 }).probability,
    ).toBeCloseTo(forgettingCurve(7, 3, -0.5), 12);

    // Post-success path: a second review (not first predictive) after a previous success.
    const successHistory = card({
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
        {
          timestamp: REVIEWED_AT - 1,
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
    });
    const postSuccessAtBoundary = model.predictRecall({
      card: successHistory,
      at: REVIEWED_AT + 21_600_000,
    }).probability;
    const postSuccessJustPast = model.predictRecall({
      card: successHistory,
      at: REVIEWED_AT + 21_601_000,
    }).probability;
    expect(postSuccessAtBoundary).toBeGreaterThan(postSuccessJustPast);
    expect(
      model.predictRecall({ card: successHistory, at: REVIEWED_AT + 86_400_000 }).probability,
    ).toBeCloseTo(forgettingCurve(1, 3, -0.5), 12);

    // No previous outcome at all (empty history is otherwise invalid; simulate via a fresh
    // extraOutcome-less first review) is routed onto the success/no-outcome path too.
    const firstReview = card({
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
    });
    expect(
      model.predictRecall({ card: firstReview, at: REVIEWED_AT + 86_400_000 }).probability,
    ).toBeCloseTo(forgettingCurve(1, 3, -0.5), 12);
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
