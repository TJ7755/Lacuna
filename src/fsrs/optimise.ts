// FSRS parameter optimisation from a deck's own review history.
//
// Training is delegated to the official optimiser from the FSRS authors
// (`@open-spaced-repetition/binding`), while this module owns the app-facing
// orchestration: review-history conversion, fit-quality scoring and safety checks.

import {
  checkParameters,
  clipParameters,
  fsrs,
  generatorParameters,
  createEmptyCard,
  default_w,
  default_relearning_steps,
  type Card as TsCard,
  type Grade as TsGrade,
} from 'ts-fsrs';
import { DEFAULT_REQUEST_RETENTION } from './params';
import { MS_PER_DAY } from './params';
import type { Card, Grade } from '../db/types';

/**
 * Minimum number of reviews before optimisation is worthwhile. Below this the fit
 * is dominated by noise, so the action is gated and the threshold is stated in the
 * UI copy. FSRS's own guidance is that a few hundred reviews is the practical floor.
 */
export const MIN_OPTIMISE_REVIEWS = 1000;
export const HOLDOUT_FRACTION = 0.2;

const EPS = 1e-6;
const NUM_RELEARNING_STEPS = default_relearning_steps.length;

/** One optimiser review in the binding-compatible format. */
export interface OptimiserReviewItem {
  rating: number;
  deltaT: number;
}

/** One card's optimiser payload (chronological review list). */
export interface OptimiserCardItem {
  reviews: OptimiserReviewItem[];
}

export interface FsrsOptimiserBinding {
  FSRSBindingReview: new (rating: number, deltaT: number) => any;
  FSRSBindingItem: new (reviews: any[]) => any;
  computeParameters: (
    trainSet: any[],
    options: {
      enableShortTerm: boolean;
      numRelearningSteps?: number;
      progress?: (current: number, total: number) => boolean | undefined | void;
      timeout?: number;
    },
  ) => Promise<number[]>;
}

/** A single card's grade sequence, the only thing the optimiser needs from a card. */
export interface ReviewSequence {
  timestamps: number[];
  grades: Grade[];
}

/** Extract the (timestamp, grade) sequences the optimiser replays. */
export function reviewSequences(cards: Card[]): ReviewSequence[] {
  return cards
    .map((card) => ({
      timestamps: card.history.map((h) => h.timestamp),
      grades: card.history.map((h) => h.grade),
    }))
    .filter((seq) => seq.grades.length > 0);
}

/** Convert persisted review history into the official optimiser item format. */
export function historyToOptimiserItems(cards: Card[]): OptimiserCardItem[] {
  return cards
    .map((card) => {
      const ordered = [...card.history].sort((a, b) => a.timestamp - b.timestamp);
      const reviews = ordered.map((review, i) => {
        const previous = i === 0 ? review.timestamp : ordered[i - 1].timestamp;
        const deltaT = i === 0 ? 0 : Math.max(0, (review.timestamp - previous) / MS_PER_DAY);
        return {
          rating: review.grade,
          deltaT,
        };
      });
      return { reviews };
    })
    .filter((item) => item.reviews.length > 0);
}

export function buildBindingItems(
  items: OptimiserCardItem[],
  binding: FsrsOptimiserBinding,
): unknown[] {
  return items.map(
    (item) =>
      new binding.FSRSBindingItem(
        item.reviews.map((review) => new binding.FSRSBindingReview(review.rating, review.deltaT)),
      ),
  );
}

/** Total reviews across the given cards. */
export function countReviews(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.history.length, 0);
}

/**
 * Mean log loss of a weight set over the review sequences: replay each card and
 * compare the predicted retrievability before each (non-first) review against the
 * actual outcome. Lower is better. Returns the loss and the number of scored reviews.
 */
export function evaluateParameters(
  sequences: ReviewSequence[],
  w: number[],
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
): { logLoss: number; scored: number } {
  const engine = fsrs(
    generatorParameters({ w, request_retention: requestRetention, enable_fuzz: false }),
  );

  let loss = 0;
  let scored = 0;
  for (const seq of sequences) {
    // Start from a fresh empty card at the first review instant and replay grades.
    let card: TsCard = createEmptyCard(new Date(seq.timestamps[0]));
    let hasPrior = false;
    for (let i = 0; i < seq.grades.length; i += 1) {
      const when = new Date(seq.timestamps[i]);
      if (hasPrior) {
        const r = engine.get_retrievability(card, when, false);
        const p = Math.min(1 - EPS, Math.max(EPS, r));
        const y = seq.grades[i] > 1 ? 1 : 0;
        loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        scored += 1;
      }
      card = engine.next(card, when, seq.grades[i] as TsGrade).card;
      hasPrior = true;
    }
  }
  return { logLoss: scored > 0 ? loss / scored : Infinity, scored };
}

export interface OptimiseOptions {
  requestRetention?: number;
  /** Weight set to compare against (defaults to the FSRS-6 defaults). */
  baselineW?: number[];
  timeoutMs?: number;
  onProgress?: (fraction: number) => void;
}

export interface OptimiseResult {
  w: number[];
  before: number;
  after: number;
  scored: number;
  improved: boolean;
}

export interface ValidationSplit {
  trainingCards: Card[];
  validationStart: number | null;
}

export function optimisationAvailable(reviewCount: number): boolean {
  return reviewCount >= MIN_OPTIMISE_REVIEWS;
}

export function improvesOutOfSample(result: Pick<OptimiseResult, 'before' | 'after'>): boolean {
  return result.after < result.before - 1e-9;
}

export function validateFittedWeights(w: number[]): number[] {
  if (w.length !== 21 || w.some((value) => !Number.isFinite(value))) {
    throw new Error('Optimiser returned an invalid parameter array.');
  }

  /**
   * Chronological train/validation split over all review events in a deck.
   * The most recent HOLDOUT_FRACTION is held out for out-of-sample scoring.
   */
  export function splitForValidation(
    cards: Card[],
    holdoutFraction: number = HOLDOUT_FRACTION,
  ): ValidationSplit {
    const timestamps = cards
      .flatMap((card) => card.history.map((entry) => entry.timestamp))
      .sort((a, b) => a - b);

    if (timestamps.length === 0) {
      return {
        trainingCards: cards.map((card) => ({ ...card, history: [...card.history] })),
        validationStart: null,
      };
    }

    const holdoutCount = Math.max(1, Math.floor(timestamps.length * holdoutFraction));
    const validationStart = timestamps[Math.max(0, timestamps.length - holdoutCount)];
    return {
      validationStart,
      trainingCards: cards.map((card) => ({
        ...card,
        history: card.history.filter((entry) => entry.timestamp < validationStart),
      })),
    };
  }

  export function evaluateParametersOnHeldOut(
    cards: Card[],
    validationStart: number | null,
    w: number[],
    requestRetention: number = DEFAULT_REQUEST_RETENTION,
  ): { logLoss: number; scored: number } {
    if (validationStart === null) return { logLoss: Infinity, scored: 0 };

    const engine = fsrs(
      generatorParameters({ w, request_retention: requestRetention, enable_fuzz: false }),
    );

    let loss = 0;
    let scored = 0;
    for (const cardRow of cards) {
      const history = [...cardRow.history].sort((a, b) => a.timestamp - b.timestamp);
      if (history.length === 0) continue;

      let card: TsCard = createEmptyCard(new Date(history[0].timestamp));
      let hasPrior = false;
      for (const review of history) {
        const when = new Date(review.timestamp);
        if (hasPrior && review.timestamp >= validationStart) {
          const r = engine.get_retrievability(card, when, false);
          const p = Math.min(1 - EPS, Math.max(EPS, r));
          const y = review.grade > 1 ? 1 : 0;
          loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
          scored += 1;
        }
        card = engine.next(card, when, review.grade as TsGrade).card;
        hasPrior = true;
      }
    }

    return { logLoss: scored > 0 ? loss / scored : Infinity, scored };
  }
  const clipped = clipParameters(w, NUM_RELEARNING_STEPS);
  const outOfRange = clipped.some((value, i) => Math.abs(value - w[i]) > 1e-12);
  if (outOfRange) {
    throw new Error('Optimiser returned weights outside the valid FSRS range.');
  }
  try {
    checkParameters(w);
  } catch {
    throw new Error('Optimiser returned weights outside the valid FSRS range.');
  }
  return [...w];
}

/**
 * Fit FSRS parameters with the official optimiser, then evaluate before/after log
 * loss by replaying the deck history under both weight sets.
 */
export async function optimiseParameters(
  cards: Card[],
  binding: FsrsOptimiserBinding,
  options: OptimiseOptions = {},
): Promise<OptimiseResult> {
  const split = splitForValidation(cards);
  const requestRetention = options.requestRetention ?? DEFAULT_REQUEST_RETENTION;
  const baselineW = options.baselineW ? [...options.baselineW] : [...default_w];
  const before = evaluateParametersOnHeldOut(
    cards,
    split.validationStart,
    baselineW,
    requestRetention,
  ).logLoss;

  const optimiserItems = historyToOptimiserItems(split.trainingCards);
  if (optimiserItems.length === 0) {
    throw new Error('Optimisation needs more training reviews before fitting can run.');
  }
  const trainSet = buildBindingItems(optimiserItems, binding);
  const fittedRaw = await binding.computeParameters(trainSet, {
    enableShortTerm: true,
    numRelearningSteps: NUM_RELEARNING_STEPS,
    timeout: options.timeoutMs,
    progress: (current, total) => {
      if (total > 0) options.onProgress?.(current / total);
    },
  });
  const w = validateFittedWeights(fittedRaw);

  const final = evaluateParametersOnHeldOut(cards, split.validationStart, w, requestRetention);
  return {
    w,
    before,
    after: final.logLoss,
    scored: final.scored,
    improved: improvesOutOfSample({ before, after: final.logLoss }),
  };
}
