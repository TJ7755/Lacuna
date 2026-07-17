import type { Card, Grade, RevisionProjection, UserPerformance } from '../db/types';
import { isAvailable } from './eligibility';
import { applyReview } from './fsrs';
import { sortByObjective, type ObjectiveContext } from './objective';
import { MASTERY_R } from './params';
import {
  DEFAULT_RESPONSE_TIME_COEFFICIENTS,
  estimateResponseTime,
  validResponseTimeCoefficients,
  type ResponseTimeCoefficients,
  type ResponseTimeEstimate,
} from './responseTimeCost';

export type MemoryModelFallbackReason = 'missing' | 'corrupt' | 'unsupported';
export type ReviewOutcome = 'success' | 'failure';

export interface RecallPrediction {
  probability: number;
  /** Standard deviation on the probability scale, when the model can provide it. */
  standardDeviation?: number;
}

export type MemoryModelValidation =
  | { valid: true }
  | { valid: false; reason: Exclude<MemoryModelFallbackReason, 'missing'> };

export interface MemoryModelCardInput {
  card: Card;
  now: number;
  assessmentAt: number;
}

export interface MemoryModelOutcomeInput extends MemoryModelCardInput {
  cardAfterFsrs: Card;
  outcome: ReviewOutcome;
  grade: Grade;
  predictAt: number;
}

/**
 * Runtime boundary for the deferred short-term model selection task. Coefficients remain
 * opaque inside the supplied implementation; the allocator never manufactures them.
 */
export interface CramMemoryModel {
  version: string;
  validate(input: MemoryModelCardInput): MemoryModelValidation;
  predictRecall(input: { card: Card; at: number }): RecallPrediction;
  simulateOutcome(input: MemoryModelOutcomeInput): RecallPrediction;
  /** Earliest model-supported next attempt, derived from current observed state. */
  nextProductiveAt(input: MemoryModelCardInput): number | null;
}

export interface SuccessGradeCoefficient {
  grade: 2 | 3 | 4;
  probability: number;
}

export interface SimulatedOutcome {
  outcome: ReviewOutcome;
  grade: Grade;
  conditionalProbability: number;
  probability: number;
  assessmentRecall: RecallPrediction;
  assessmentRecallGain: number;
}

export interface OutcomeSimulation {
  successProbability: number;
  currentAssessmentRecall: RecallPrediction;
  outcomes: SimulatedOutcome[];
  expectedAssessmentRecallGain: number;
  gainStandardDeviation?: number;
  secureProbability: number;
}

function validPrediction(prediction: RecallPrediction): boolean {
  return (
    Number.isFinite(prediction.probability) &&
    prediction.probability >= 0 &&
    prediction.probability <= 1 &&
    (prediction.standardDeviation === undefined ||
      (Number.isFinite(prediction.standardDeviation) &&
        prediction.standardDeviation >= 0 &&
        prediction.standardDeviation <= 0.5))
  );
}

function validSuccessGrades(coefficients: readonly SuccessGradeCoefficient[]): boolean {
  if (coefficients.length === 0) return false;
  const seen = new Set<Grade>();
  let total = 0;
  for (const coefficient of coefficients) {
    if (
      seen.has(coefficient.grade) ||
      ![2, 3, 4].includes(coefficient.grade) ||
      !Number.isFinite(coefficient.probability) ||
      coefficient.probability <= 0
    ) {
      return false;
    }
    seen.add(coefficient.grade);
    total += coefficient.probability;
  }
  return Math.abs(total - 1) <= 1e-9;
}

function cardAfterReview(card: Card, grade: Grade, now: number, context: ObjectiveContext): Card {
  const { memory } = applyReview(context.ctx.fsrs, card, grade, now);
  return { ...card, ...memory };
}

export function simulateReviewOutcomes(
  card: Card,
  model: CramMemoryModel,
  successGrades: readonly SuccessGradeCoefficient[],
  context: ObjectiveContext,
  now: number,
  assessmentAt: number,
): OutcomeSimulation | null {
  if (!validSuccessGrades(successGrades)) return null;
  const successNow = model.predictRecall({ card, at: now });
  const currentAssessmentRecall = model.predictRecall({ card, at: assessmentAt });
  if (!validPrediction(successNow) || !validPrediction(currentAssessmentRecall)) return null;

  const branch = (
    outcome: ReviewOutcome,
    grade: Grade,
    conditionalProbability: number,
    probability: number,
  ): SimulatedOutcome | null => {
    const cardAfterFsrs = cardAfterReview(card, grade, now, context);
    const assessmentRecall = model.simulateOutcome({
      card,
      cardAfterFsrs,
      outcome,
      grade,
      now,
      assessmentAt,
      predictAt: assessmentAt,
    });
    if (!validPrediction(assessmentRecall)) return null;
    return {
      outcome,
      grade,
      conditionalProbability,
      probability,
      assessmentRecall,
      assessmentRecallGain: assessmentRecall.probability - currentAssessmentRecall.probability,
    };
  };

  const outcomes: SimulatedOutcome[] = [];
  const failureProbability = 1 - successNow.probability;
  const failure = branch('failure', 1, 1, failureProbability);
  if (!failure) return null;
  outcomes.push(failure);
  for (const coefficient of successGrades) {
    const success = branch(
      'success',
      coefficient.grade,
      coefficient.probability,
      successNow.probability * coefficient.probability,
    );
    if (!success) return null;
    outcomes.push(success);
  }

  const expectedAssessmentRecallGain = outcomes.reduce(
    (sum, outcome) => sum + outcome.probability * outcome.assessmentRecallGain,
    0,
  );
  const hasUncertainty =
    currentAssessmentRecall.standardDeviation !== undefined ||
    outcomes.some((outcome) => outcome.assessmentRecall.standardDeviation !== undefined);
  const gainStandardDeviation = hasUncertainty
    ? Math.sqrt(
        (currentAssessmentRecall.standardDeviation ?? 0) ** 2 +
          outcomes.reduce(
            (variance, outcome) =>
              variance +
              (outcome.probability * (outcome.assessmentRecall.standardDeviation ?? 0)) ** 2,
            0,
          ),
      )
    : undefined;
  const secureProbability =
    currentAssessmentRecall.probability >= MASTERY_R
      ? 0
      : outcomes.reduce(
          (sum, outcome) =>
            sum + (outcome.assessmentRecall.probability >= MASTERY_R ? outcome.probability : 0),
          0,
        );
  return {
    successProbability: successNow.probability,
    currentAssessmentRecall,
    outcomes,
    expectedAssessmentRecallGain,
    ...(gainStandardDeviation === undefined ? {} : { gainStandardDeviation }),
    secureProbability,
  };
}

export interface CramAllocatorInput {
  cards: readonly Card[];
  eligibleCardIds: ReadonlySet<string>;
  context: ObjectiveContext;
  assessmentAt: number;
  now: number;
  remainingWindowSeconds: number;
  currentWindowId: string;
  futureWindowStarts: readonly number[];
  projection: RevisionProjection;
  model?: CramMemoryModel;
  successGrades?: readonly SuccessGradeCoefficient[];
  performanceByDeck?: ReadonlyMap<string, UserPerformance>;
  responseTimeCoefficients?: ResponseTimeCoefficients;
}

export interface AllocatedCard {
  card: Card;
  simulation: OutcomeSimulation;
  responseTime: ResponseTimeEstimate;
  expectedReviewSeconds: number;
  expectedGainPerMinute: number;
  gainPerMinuteStandardDeviation?: number;
}

export type CramAllocation =
  | {
      mode: 'practice-fallback';
      fallbackReason: MemoryModelFallbackReason;
      cards: Card[];
    }
  | {
      mode: 'memory-model';
      modelVersion: string;
      selected: AllocatedCard | null;
      ranked: AllocatedCard[];
      deferredCardIds: string[];
      stopReason?: 'budget-exhausted' | 'no-positive-value' | 'future-window-spacing';
    };

function fallback(
  cards: Card[],
  context: ObjectiveContext,
  now: number,
  reason: MemoryModelFallbackReason,
): CramAllocation {
  return {
    mode: 'practice-fallback',
    fallbackReason: reason,
    cards: sortByObjective(cards, context, now).map(({ card }) => card),
  };
}

function lastObservedReview(card: Card) {
  return card.history.reduce<(typeof card.history)[number] | undefined>(
    (latest, review) => (!latest || review.timestamp > latest.timestamp ? review : latest),
    undefined,
  );
}

/** Rebuild the next-card decision from current evidence. No queue is persisted. */
export function allocateCramReview(input: CramAllocatorInput): CramAllocation {
  const pool = input.cards.filter(
    (card) => input.eligibleCardIds.has(card.id) && isAvailable(card, input.now),
  );
  if (input.projection.projectionMode === 'fsrs-6-practice-fallback') {
    return fallback(pool, input.context, input.now, input.projection.fallbackReason);
  }
  if (!input.model || !input.successGrades) {
    return fallback(pool, input.context, input.now, 'missing');
  }
  if (input.model.version !== input.projection.memoryModelVersion) {
    return fallback(pool, input.context, input.now, 'unsupported');
  }
  const responseCoefficients = input.responseTimeCoefficients ?? DEFAULT_RESPONSE_TIME_COEFFICIENTS;
  if (
    !validSuccessGrades(input.successGrades) ||
    !validResponseTimeCoefficients(responseCoefficients)
  ) {
    return fallback(pool, input.context, input.now, 'corrupt');
  }
  for (const card of pool) {
    const validation = input.model.validate({
      card,
      now: input.now,
      assessmentAt: input.assessmentAt,
    });
    if (!validation.valid) return fallback(pool, input.context, input.now, validation.reason);
  }

  if (!Number.isFinite(input.remainingWindowSeconds) || input.remainingWindowSeconds <= 0) {
    return {
      mode: 'memory-model',
      modelVersion: input.model.version,
      selected: null,
      ranked: [],
      deferredCardIds: [],
      stopReason: 'budget-exhausted',
    };
  }

  const hasFutureWindow = input.futureWindowStarts.some(
    (start) => Number.isFinite(start) && start > input.now && start < input.assessmentAt,
  );
  const deferredCardIds: string[] = [];
  const ranked: AllocatedCard[] = [];
  for (const card of pool) {
    const lastReview = lastObservedReview(card);
    if (
      hasFutureWindow &&
      lastReview?.revisionWindowId === input.currentWindowId &&
      lastReview.correct === true
    ) {
      deferredCardIds.push(card.id);
      continue;
    }
    const productiveAt = input.model.nextProductiveAt({
      card,
      now: input.now,
      assessmentAt: input.assessmentAt,
    });
    if (productiveAt !== null && (!Number.isFinite(productiveAt) || productiveAt < 0)) {
      return fallback(pool, input.context, input.now, 'unsupported');
    }
    if (productiveAt === null || productiveAt > input.assessmentAt) continue;
    if (productiveAt > input.now) {
      deferredCardIds.push(card.id);
      continue;
    }

    const simulation = simulateReviewOutcomes(
      card,
      input.model,
      input.successGrades,
      input.context,
      input.now,
      input.assessmentAt,
    );
    if (!simulation) return fallback(pool, input.context, input.now, 'corrupt');
    if (
      input.context.objective === 'securedTopics' &&
      simulation.currentAssessmentRecall.probability >= MASTERY_R
    ) {
      continue;
    }
    const responseTime = estimateResponseTime(
      input.performanceByDeck?.get(card.deckId),
      responseCoefficients,
    );
    const expectedReviewSeconds =
      responseTime.expectedSeconds +
      (1 - simulation.successProbability) * responseCoefficients.failureFeedbackSeconds;
    const durationDeviation = Math.sqrt(
      responseTime.standardDeviationSeconds ** 2 +
        simulation.successProbability *
          (1 - simulation.successProbability) *
          responseCoefficients.failureFeedbackSeconds ** 2,
    );
    const expectedGainPerMinute =
      (simulation.expectedAssessmentRecallGain * 60) / expectedReviewSeconds;
    const gainPerMinuteStandardDeviation =
      simulation.gainStandardDeviation === undefined
        ? undefined
        : 60 *
          Math.sqrt(
            (simulation.gainStandardDeviation / expectedReviewSeconds) ** 2 +
              ((simulation.expectedAssessmentRecallGain * durationDeviation) /
                expectedReviewSeconds ** 2) **
                2,
          );
    if (Number.isFinite(expectedGainPerMinute) && expectedGainPerMinute > 0) {
      ranked.push({
        card,
        simulation,
        responseTime,
        expectedReviewSeconds,
        expectedGainPerMinute,
        ...(gainPerMinuteStandardDeviation === undefined ? {} : { gainPerMinuteStandardDeviation }),
      });
    }
  }

  ranked.sort((left, right) => {
    if (input.context.objective === 'securedTopics') {
      const crossing = right.simulation.secureProbability - left.simulation.secureProbability;
      if (crossing !== 0) return crossing;
    }
    return (
      right.expectedGainPerMinute - left.expectedGainPerMinute ||
      left.card.id.localeCompare(right.card.id)
    );
  });
  const selected = ranked.find(
    (candidate) => candidate.expectedReviewSeconds <= input.remainingWindowSeconds,
  );
  const stopReason = selected
    ? undefined
    : ranked.length > 0
      ? 'budget-exhausted'
      : deferredCardIds.length > 0
        ? 'future-window-spacing'
        : 'no-positive-value';
  return {
    mode: 'memory-model',
    modelVersion: input.model.version,
    selected: selected ?? null,
    ranked,
    deferredCardIds,
    ...(stopReason ? { stopReason } : {}),
  };
}
