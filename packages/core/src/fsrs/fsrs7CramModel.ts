import type { Card, FsrsParameters, RevisionProjection } from '@lacuna/core/db/types';
import type {
  CramMemoryModel,
  MemoryModelFallbackReason,
  RecallPrediction,
  SuccessGradeCoefficient,
} from '@lacuna/core/fsrs/cramAllocator';
import { makeEngine, memoryState } from '@lacuna/core/fsrs/fsrs';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { lacksUnprimedRetest } from '@lacuna/core/fsrs/primedReview';

/** Keep plan provenance tied to the complete scheduler configuration. */
export function projectionForFsrs7(params: FsrsParameters): RevisionProjection {
  return {
    projectionMode: 'memory-model',
    memoryModelVersion: `fsrs-7:${JSON.stringify(params)}`,
  };
}

/** Existing deterministic success convention; recall confidence remains model-derived. */
export const CRAM_SUCCESS_GRADES: readonly SuccessGradeCoefficient[] = [
  { grade: 3, probability: 1 },
];

function lastReview(card: Card) {
  return card.history.reduce<(typeof card.history)[number] | undefined>(
    (latest, review) => (!latest || review.timestamp > latest.timestamp ? review : latest),
    undefined,
  );
}

function cardValidationReason(card: Card): Exclude<MemoryModelFallbackReason, 'missing'> | null {
  const latest = lastReview(card);
  if (
    latest === undefined ||
    card.lastReviewed === null ||
    card.stability === null ||
    card.stabilityFast === null ||
    card.difficulty === null
  ) {
    return 'unsupported';
  }
  if (!(
    Number.isFinite(latest.timestamp) &&
    Number.isFinite(card.lastReviewed) &&
    Number.isFinite(card.stability) &&
    card.stability > 0 &&
    Number.isFinite(card.difficulty) &&
    card.difficulty >= 1 &&
    card.difficulty <= 10 &&
    Number.isFinite(card.stabilityFast) &&
    card.stabilityFast > 0 &&
    card.history.every(
      (review) =>
        Number.isFinite(review.timestamp) &&
        [1, 2, 3, 4].includes(review.grade) &&
        (review.correct === undefined || typeof review.correct === 'boolean'),
    )
  )) {
    return 'corrupt';
  }
  // A primed answer is not independent evidence; claim nothing until a spaced retest.
  if (lacksUnprimedRetest(card.history)) return 'unsupported';
  return [0, 1, 2, 3].includes(card.state) ? null : 'unsupported';
}

/** FSRS owns both fast and slow recall; cram policy stays in the allocator. */
export function createFsrs7CramModel(params: FsrsParameters): CramMemoryModel {
  const engine = makeEngine(params);
  function predict(card: Card, at: number): RecallPrediction {
    // Legacy S/D without a fast trace are opaque evidence, not FSRS-7 memory.
    if (card.stabilityFast === null || card.lastReviewed === null) {
      return { probability: Number.NaN };
    }
    const probability = engine.model.forgettingCurve(
      memoryState(card),
      Math.max(0, at - card.lastReviewed) / MS_PER_DAY,
    );
    return {
      probability,
      // Uncertainty of a recall outcome, rather than parameter-estimation uncertainty.
      standardDeviation: Math.sqrt(probability * (1 - probability)),
    };
  }
  return {
    version: projectionForFsrs7(params).memoryModelVersion,
    validate({ card, now, assessmentAt }) {
      const cardReason = cardValidationReason(card);
      if (cardReason) return { valid: false, reason: cardReason };
      if (
        !Number.isFinite(now) ||
        !Number.isFinite(assessmentAt) ||
        assessmentAt < now ||
        card.lastReviewed === null ||
        now < card.lastReviewed
      ) {
        return { valid: false, reason: 'unsupported' };
      }
      return { valid: true };
    },
    predictRecall({ card, at }) {
      return predict(card, at);
    },
    simulateOutcome({ cardAfterFsrs, predictAt }) {
      return predict(cardAfterFsrs, predictAt);
    },
    nextProductiveAt({ card, now }) {
      return card.due === null ? now : Math.max(now, card.due);
    },
  };
}

export function readinessFromPredictions(
  predictions: readonly RecallPrediction[],
): RecallPrediction | null {
  if (
    predictions.length === 0 ||
    predictions.some(
      (value) =>
        !Number.isFinite(value.probability) ||
        value.probability < 0 ||
        value.probability > 1 ||
        value.standardDeviation === undefined ||
        !Number.isFinite(value.standardDeviation),
    )
  ) {
    return null;
  }
  return {
    probability:
      predictions.reduce((total, value) => total + value.probability, 0) / predictions.length,
    standardDeviation:
      Math.sqrt(predictions.reduce((total, value) => total + value.standardDeviation! ** 2, 0)) /
      predictions.length,
  };
}
