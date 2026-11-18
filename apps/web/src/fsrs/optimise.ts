// FSRS parameter optimisation from a deck's own review history.
//
// Lacuna uses the official gradient-based trainer from the ts-fsrs authors
// (`@open-spaced-repetition/binding`, fsrs-rs via WASM in the browser worker).
// Review histories are converted to the binding's item format, fitted with
// `computeParameters()`, and validated against FSRS valid ranges before they can
// ever be applied. Log-loss evaluation for before/after summaries uses the core FSRS-7
// runtime (see `evaluateParameters`).
//
// This runs off the main thread in a Web Worker (see src/workers/optimise.worker.ts)
// because training on long histories is CPU-heavy.

import type { FSRSBindingItem } from '@open-spaced-repetition/binding';
import { defaultRelearningSteps } from 'ts-fsrs/middlewares';
import { FSRS7_DEFAULT_WEIGHTS, checkFSRS7Parameters } from 'ts-fsrs/models/fsrs-7';
import {
  DEFAULT_REQUEST_RETENTION,
  MS_PER_DAY,
  defaultFsrsParameters,
} from '@lacuna/core/fsrs/params';
import { makeEngine, applyReview } from '@lacuna/core/fsrs/fsrs';
import type { Card, Grade } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
export { MIN_OPTIMISE_REVIEWS } from './optimiseConfig';

const EPS = 1e-6;
const NUM_RELEARNING_STEPS = defaultRelearningSteps.length;

/** A single card's grade sequence, the only thing the optimiser needs from a card. */
export interface ReviewSequence {
  timestamps: number[];
  grades: Grade[];
}

/** Plain review record for the binding trainer (rating 1–4, deltaT in days). */
export interface BindingReviewData {
  rating: number;
  deltaT: number;
}

function historyByCard(
  reviewHistory: readonly ReviewHistoryEntry[],
): Map<string, ReviewHistoryEntry[]> {
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of reviewHistory) {
    const history = byCard.get(entry.cardId) ?? [];
    history.push(entry);
    byCard.set(entry.cardId, history);
  }
  return byCard;
}

/** Extract the (timestamp, grade) sequences the optimiser replays. */
export function reviewSequences(
  cards: Card[],
  reviewHistory?: readonly ReviewHistoryEntry[],
): ReviewSequence[] {
  const history = reviewHistory ? historyByCard(reviewHistory) : undefined;
  return cards
    .map((card) => {
      const events = history ? (history.get(card.id) ?? []) : card.history;
      return {
        timestamps: events.map((event) => event.timestamp),
        grades: events.map((event) => event.grade),
      };
    })
    .filter((seq) => seq.grades.length > 0);
}

/** Convert one card's review sequence to binding review records. First review deltaT is 0. */
export function sequenceToBindingReviews(seq: ReviewSequence): BindingReviewData[] {
  return seq.grades.map((grade, i) => ({
    rating: grade,
    deltaT: i === 0 ? 0 : (seq.timestamps[i] - seq.timestamps[i - 1]) / MS_PER_DAY,
  }));
}

/** Total reviews across the given cards. */
export function countReviews(cards: Card[], reviewHistory?: readonly ReviewHistoryEntry[]): number {
  return reviewSequences(cards, reviewHistory).reduce(
    (sum, sequence) => sum + sequence.grades.length,
    0,
  );
}

/** Reject malformed or out-of-range FSRS-7 weights, including cross-weight constraints. */
export function validateFittedWeights(w: number[]): void {
  if (w.length !== 34) {
    throw new Error(`Trainer returned ${w.length} weights; expected 34.`);
  }
  checkFSRS7Parameters(w);
}

/** Non-throwing variant for callers that need to report failure in UI copy. */
export function tryValidateFittedWeights(
  w: number[],
): { ok: true } | { ok: false; message: string } {
  try {
    validateFittedWeights(w);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Result of splitting review sequences chronologically into train and validation. */
export interface SplitResult {
  trainSequences: ReviewSequence[];
  validationSequences: ReviewSequence[];
  cutoffTimestamp: number;
}

/**
 * Split review sequences chronologically so validation always tests on reviews the
 * fit did not see. The cutoff is placed so roughly `trainFraction` of all reviews
 * fall into training and the remainder into validation.
 */
export function chronologicallySplitSequences(
  sequences: ReviewSequence[],
  trainFraction: number = 0.8,
): SplitResult {
  const allTimestamps: number[] = [];
  for (const seq of sequences) {
    allTimestamps.push(...seq.timestamps);
  }
  allTimestamps.sort((a, b) => a - b);

  const cutoffIndex = Math.max(0, Math.floor(allTimestamps.length * trainFraction) - 1);
  const cutoffTimestamp = allTimestamps[cutoffIndex] ?? Infinity;

  const trainSequences: ReviewSequence[] = [];
  const validationSequences: ReviewSequence[] = [];

  for (const seq of sequences) {
    const splitIndex = seq.timestamps.findIndex((t) => t > cutoffTimestamp);
    if (splitIndex === -1) {
      trainSequences.push(seq);
      validationSequences.push({ timestamps: [], grades: [] });
    } else if (splitIndex === 0) {
      trainSequences.push({ timestamps: [], grades: [] });
      validationSequences.push(seq);
    } else {
      trainSequences.push({
        timestamps: seq.timestamps.slice(0, splitIndex),
        grades: seq.grades.slice(0, splitIndex),
      });
      validationSequences.push({
        timestamps: seq.timestamps.slice(splitIndex),
        grades: seq.grades.slice(splitIndex),
      });
    }
  }

  return { trainSequences, validationSequences, cutoffTimestamp };
}

export interface EvaluateOptions {
  /** If provided, only score reviews whose timestamp is strictly greater than this value. */
  scoreAfterTimestamp?: number;
}

/**
 * Mean log loss of a weight set over the review sequences: replay each card and
 * compare the predicted retrievability before each (non-first) review against the
 * actual outcome. Lower is better. Returns the loss and the number of scored reviews.
 *
 * When `scoreAfterTimestamp` is given, only reviews after that timestamp are
 * scored; earlier reviews still update the simulated card state so the evaluation
 * is honest (the model has not seen the held-out reviews).
 */
export function evaluateParameters(
  sequences: ReviewSequence[],
  w: number[],
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
  options?: EvaluateOptions,
): { logLoss: number; scored: number } {
  validateFittedWeights(w);
  const engine = makeEngine({
    ...defaultFsrsParameters(),
    w: [...w],
    requestRetention,
    enable_fuzz: false,
  });

  let loss = 0;
  let scored = 0;
  for (const seq of sequences) {
    let card: Card = {
      id: 'optimisation-replay',
      conceptId: 'optimisation-replay',
      deckId: 'optimisation-replay',
      schedulingUnitId: 'optimisation-replay',
      type: 'front_back',
      front: '',
      back: '',
      stability: null,
      stabilityFast: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: seq.timestamps[0],
      updatedAt: seq.timestamps[0],
    };
    for (let i = 0; i < seq.grades.length; i += 1) {
      const result = applyReview(engine, card, seq.grades[i], seq.timestamps[i]);
      if (
        result.retrievabilityAtReview !== null &&
        (options?.scoreAfterTimestamp === undefined ||
          seq.timestamps[i] > options.scoreAfterTimestamp)
      ) {
        const r = result.retrievabilityAtReview;
        const p = Math.min(1 - EPS, Math.max(EPS, r));
        const y = seq.grades[i] > 1 ? 1 : 0;
        loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        scored += 1;
      }
      card = { ...card, ...result.memory };
    }
  }
  return { logLoss: scored > 0 ? loss / scored : NaN, scored };
}

interface ComputeParametersOptions {
  /** Explicitly select the same dual-trace model as the scheduler. */
  modelVersion: 'FSRS-7';
  enableShortTerm: boolean;
  numRelearningSteps: number;
  progress?: (current: number, total: number) => boolean | void | undefined;
}

/** Trainer entry point (injected so tests can use the native binding in Node). */
type ComputeParametersFn = (
  trainSet: FSRSBindingItem[],
  options: ComputeParametersOptions,
) => Promise<number[]>;

export interface OptimiseOptions {
  requestRetention?: number;
  /** Canonical event-store rows. Omit only for legacy callers using Card.history. */
  reviewHistory?: readonly ReviewHistoryEntry[];
  /** Weight set to score the "before" metric (defaults to FSRS-7 defaults). */
  initialW?: number[];
  onProgress?: (fraction: number) => void;
  computeParameters: ComputeParametersFn;
  createItem: (reviews: BindingReviewData[]) => FSRSBindingItem;
}

export interface OptimiseResult {
  w: number[];
  before: number;
  after: number;
  scored: number;
  /** True when the fitted weights beat the defaults on held-out validation data. */
  isOutOfSampleWin: boolean;
}

/**
 * Fit FSRS weights to the deck's review history via the official binding trainer.
 * Weights are validated before being returned.
 */
export async function optimiseParameters(
  cards: Card[],
  options: OptimiseOptions,
): Promise<OptimiseResult> {
  const allSequences = reviewSequences(cards, options.reviewHistory);
  const requestRetention = options.requestRetention ?? DEFAULT_REQUEST_RETENTION;
  const initialW = options.initialW ? [...options.initialW] : [...FSRS7_DEFAULT_WEIGHTS];
  validateFittedWeights(initialW);

  // Split chronologically: train on earlier reviews, validate on later ones.
  const { trainSequences, cutoffTimestamp } = chronologicallySplitSequences(allSequences);

  const trainSet = trainSequences
    .filter((seq) => seq.grades.length > 0)
    .map((seq) => options.createItem(sequenceToBindingReviews(seq)));

  if (trainSet.length === 0) {
    throw new Error('Training set is empty after the chronological split.');
  }

  // Evaluate defaults and the eventual fit on the held-out portion only.
  const before = evaluateParameters(allSequences, initialW, requestRetention, {
    scoreAfterTimestamp: cutoffTimestamp,
  }).logLoss;

  const rawW = await options.computeParameters(trainSet, {
    modelVersion: 'FSRS-7',
    enableShortTerm: true,
    numRelearningSteps: NUM_RELEARNING_STEPS,
    progress: (current, total) => {
      if (total > 0) options.onProgress?.(current / total);
    },
  });

  const validation = tryValidateFittedWeights(rawW);
  if (!validation.ok) {
    throw new Error(`Trainer returned weights outside FSRS valid ranges: ${validation.message}`);
  }

  const w = [...rawW];

  const final = evaluateParameters(allSequences, w, requestRetention, {
    scoreAfterTimestamp: cutoffTimestamp,
  });

  const isOutOfSampleWin = final.scored > 0 && final.logLoss < before;

  return {
    w,
    before,
    after: final.logLoss,
    scored: final.scored,
    isOutOfSampleWin,
  };
}
