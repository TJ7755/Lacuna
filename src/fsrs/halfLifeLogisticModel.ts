import frozenCoefficients from '../../tooling/short-term-memory/coefficients/half-life-logistic-v1.json';
import type { Card, ReviewLog, RevisionProjection } from '../db/types';
import type {
  CramMemoryModel,
  MemoryModelFallbackReason,
  RecallPrediction,
  SuccessGradeCoefficient,
} from './cramAllocator';
import { forgettingCurve } from './forwardSim';
import { MS_PER_DAY } from './params';

const MODEL_NAME = 'half-life-logistic-v1-lag64-count8';
const FEATURE_NAMES = [
  'intercept',
  'log_elapsed_seconds',
  'previous_success',
  'previous_failure',
  'first_predictive_review',
  'log_prior_successes',
  'log_prior_failures',
  'state_learning',
  'state_review',
  'state_relearning',
] as const;
const COUNT_CAP = 8;
const SHORT_TERM_ONLY_SECONDS = 518_400;
const FSRS_ONLY_SECONDS = 604_800;
const LOCAL_FIT_MINIMUM = 500;
const LOCAL_FIT_PRIOR = 1_000;
const PROBABILITY_EPSILON = 1e-9;

interface LoadedCoefficients {
  values: readonly number[];
  version: string;
}

export interface HalfLifeLogisticLocalFit {
  scoredExamples: number;
  intercept: number;
  previousSuccess: number;
  previousFailure: number;
}

export type HalfLifeLogisticLoadResult =
  | { valid: true; coefficients: LoadedCoefficients }
  | { valid: false; reason: MemoryModelFallbackReason };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactArray(value: unknown, expected: readonly unknown[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function versionHash(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const character of values.join(',')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Validate the complete frozen artefact before exposing any model confidence. */
export function loadHalfLifeLogisticCoefficients(raw: unknown): HalfLifeLogisticLoadResult {
  if (raw === undefined || raw === null) return { valid: false, reason: 'missing' };
  const root = record(raw);
  if (!root) return { valid: false, reason: 'corrupt' };
  const values = root.coefficients;
  if (
    root.schema_version !== 1 ||
    root.candidate !== MODEL_NAME ||
    !Array.isArray(values) ||
    values.length !== FEATURE_NAMES.length ||
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value)) ||
    !exactArray(root.features, FEATURE_NAMES)
  ) {
    return { valid: false, reason: 'corrupt' };
  }

  const fit = record(root.fit);
  const supported = record(root.supported_features);
  const composition = record(root.probability_composition);
  const fallback = record(root.fallback);
  const personalisation = record(root.personalisation);
  const elapsedRange = supported?.elapsed_seconds;
  const stateRange = supported?.state;
  if (
    fit?.count_cap !== COUNT_CAP ||
    fit?.lag_bins !== 64 ||
    !exactArray(elapsedRange, [0, FSRS_ONLY_SECONDS]) ||
    !exactArray(stateRange, [0, 1, 2, 3]) ||
    supported?.previous_recalled !== 'required boolean' ||
    supported?.prior_counts !== 'non-negative; each count is capped at 8 for the model feature' ||
    composition?.short_term_only_through_seconds !== SHORT_TERM_ONLY_SECONDS ||
    composition?.fsrs_only_from_seconds !== FSRS_ONLY_SECONDS ||
    fallback?.lag_above_seconds !== FSRS_ONLY_SECONDS ||
    fallback?.model !== 'FSRS-6' ||
    personalisation?.global_only_below_local_examples !== LOCAL_FIT_MINIMUM ||
    personalisation?.shrinkage_pseudo_examples !== LOCAL_FIT_PRIOR ||
    !exactArray(personalisation?.local_parameters, [
      'intercept',
      'previous_success',
      'previous_failure',
    ])
  ) {
    return { valid: false, reason: 'unsupported' };
  }

  const numericValues = values as number[];
  return {
    valid: true,
    coefficients: {
      values: Object.freeze([...numericValues]),
      version: `${MODEL_NAME}-${versionHash(numericValues)}`,
    },
  };
}

export const halfLifeLogisticLoad = loadHalfLifeLogisticCoefficients(frozenCoefficients);

export function projectionForHalfLifeLogistic(raw: unknown): RevisionProjection {
  const loaded = loadHalfLifeLogisticCoefficients(raw);
  return loaded.valid
    ? { projectionMode: 'memory-model', memoryModelVersion: loaded.coefficients.version }
    : {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: loaded.reason,
      };
}

export const revisionProjection: RevisionProjection =
  projectionForHalfLifeLogistic(frozenCoefficients);

/** Existing deterministic FSRS success convention; recall confidence remains model-derived. */
export const CRAM_SUCCESS_GRADES: readonly SuccessGradeCoefficient[] = [
  { grade: 3, probability: 1 },
];

function lastReview(card: Card) {
  return card.history.reduce<(typeof card.history)[number] | undefined>(
    (latest, review) => (!latest || review.timestamp > latest.timestamp ? review : latest),
    undefined,
  );
}

function outcome(review: ReviewLog): boolean {
  return review.correct ?? review.grade > 1;
}

function cardValidationReason(card: Card): Exclude<MemoryModelFallbackReason, 'missing'> | null {
  const latest = lastReview(card);
  if (latest === undefined || card.lastReviewed === null || card.stability === null) {
    return 'unsupported';
  }
  if (
    !(
      Number.isFinite(latest.timestamp) &&
      Number.isFinite(card.lastReviewed) &&
      Number.isFinite(card.stability) &&
      card.stability > 0 &&
      card.history.every(
        (review) =>
          Number.isFinite(review.timestamp) &&
          [1, 2, 3, 4].includes(review.grade) &&
          (review.correct === undefined || typeof review.correct === 'boolean'),
      )
    )
  ) {
    return 'corrupt';
  }
  return [0, 1, 2, 3].includes(card.state) ? null : 'unsupported';
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const inverse = Math.exp(-Math.min(value, 40));
    return 1 / (1 + inverse);
  }
  const exponent = Math.exp(Math.max(value, -40));
  return exponent / (1 + exponent);
}

function prediction(probability: number): RecallPrediction {
  const bounded = Math.min(Math.max(probability, PROBABILITY_EPSILON), 1 - PROBABILITY_EPSILON);
  return {
    probability: bounded,
    standardDeviation: Math.sqrt(bounded * (1 - bounded)),
  };
}

function shortTermWeight(elapsedSeconds: number): number {
  if (elapsedSeconds <= SHORT_TERM_ONLY_SECONDS) return 1;
  if (elapsedSeconds >= FSRS_ONLY_SECONDS) return 0;
  const position =
    (elapsedSeconds - SHORT_TERM_ONLY_SECONDS) / (FSRS_ONLY_SECONDS - SHORT_TERM_ONLY_SECONDS);
  const smoothstep = position * position * (3 - 2 * position);
  return 1 - smoothstep;
}

function personalisedValues(
  global: readonly number[],
  localFit?: HalfLifeLogisticLocalFit,
): readonly number[] {
  if (
    !localFit ||
    !Number.isInteger(localFit.scoredExamples) ||
    localFit.scoredExamples < LOCAL_FIT_MINIMUM ||
    ![localFit.intercept, localFit.previousSuccess, localFit.previousFailure].every(Number.isFinite)
  ) {
    return global;
  }
  const weight = localFit.scoredExamples / (localFit.scoredExamples + LOCAL_FIT_PRIOR);
  const values = [...global];
  values[0] += weight * (localFit.intercept - values[0]);
  values[2] += weight * (localFit.previousSuccess - values[2]);
  values[3] += weight * (localFit.previousFailure - values[3]);
  return values;
}

interface FeatureContext {
  card: Card;
  at: number;
  extraOutcome?: boolean;
  state?: Card['state'];
  lastReviewed?: number;
  stability?: number | null;
}

function predict(
  input: FeatureContext,
  coefficients: readonly number[],
  decay: number,
): RecallPrediction {
  const history = input.card.history;
  const latest = lastReview(input.card);
  const previous = input.extraOutcome ?? (latest ? outcome(latest) : false);
  const reviewCount = history.length + (input.extraOutcome === undefined ? 0 : 1);
  const successes = history.filter(outcome).length + (input.extraOutcome === true ? 1 : 0);
  const failures = reviewCount - successes;
  const lastReviewed = input.lastReviewed ?? input.card.lastReviewed;
  const stability = input.stability ?? input.card.stability;
  const elapsedSeconds = Math.max(0, (input.at - (lastReviewed ?? input.at)) / 1_000);
  const scaledElapsed =
    Math.log1p(Math.min(elapsedSeconds, FSRS_ONLY_SECONDS)) / Math.log1p(FSRS_ONLY_SECONDS);
  const state = input.state ?? input.card.state;
  const features = [
    1,
    scaledElapsed,
    Number(previous),
    Number(!previous),
    Number(reviewCount === 1),
    Math.log1p(Math.min(successes, COUNT_CAP)) / Math.log1p(COUNT_CAP),
    Math.log1p(Math.min(failures, COUNT_CAP)) / Math.log1p(COUNT_CAP),
    Number(state === 1),
    Number(state === 2),
    Number(state === 3),
  ];
  const shortTerm = sigmoid(
    coefficients.reduce((total, coefficient, index) => total + coefficient * features[index], 0),
  );
  const fsrs = forgettingCurve(elapsedSeconds / (MS_PER_DAY / 1_000), stability ?? 0, decay);
  const weight = shortTermWeight(elapsedSeconds);
  return prediction(weight * shortTerm + (1 - weight) * fsrs);
}

export function createHalfLifeLogisticModel(
  decay: number,
  raw: unknown = frozenCoefficients,
  localFit?: HalfLifeLogisticLocalFit,
): CramMemoryModel | undefined {
  const loaded = loadHalfLifeLogisticCoefficients(raw);
  if (!loaded.valid || !Number.isFinite(decay) || decay >= 0) return undefined;
  const coefficients = personalisedValues(loaded.coefficients.values, localFit);
  return {
    version: loaded.coefficients.version,
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
      return predict({ card, at }, coefficients, decay);
    },
    simulateOutcome({ card, cardAfterFsrs, outcome: reviewOutcome, now, predictAt }) {
      return predict(
        {
          card,
          at: predictAt,
          extraOutcome: reviewOutcome === 'success',
          state: cardAfterFsrs.state,
          lastReviewed: now,
          stability: cardAfterFsrs.stability,
        },
        coefficients,
        decay,
      );
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
