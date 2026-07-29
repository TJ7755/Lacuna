// The invisible rating engine. The user sees only "Yes (Correct)" and "No (Incorrect)";
// an FSRS grade is inferred from correctness and the response time, calibrated per deck.

import type { Grade, UserPerformance } from '../db/types';

/** Number of correct reviews required before switching from fixed to adaptive thresholds. */
const CALIBRATION_THRESHOLD = 20;

/** Fixed thresholds (seconds) used during the calibration period. */
const FAST_SECONDS = 3.0;
const SLOW_SECONDS = 8.0;

/** Number of standard deviations either side of the mean for adaptive grading. */
const SIGMA_FACTOR = 0.75;

/**
 * Fixed time penalty (seconds) added to the response time used for silent-mode grading
 * only, when the learner used a hint before answering (lines-mode cards; see
 * src/components/learn/LineHint.tsx). ts-fsrs's own weights model grades and the
 * resulting intervals — they never see response time — so there is nowhere inside FSRS
 * for a "used a hint" adjustment to live; it belongs entirely in Lacuna's own invisible
 * grading layer, as a named, tunable constant rather than a magic number at the call
 * site. Callers apply this to the responseTimeSec passed into gradeFromResponse only;
 * the true, unpenalised responseTimeSec is still what's persisted on the ReviewLog and
 * folded into updatePerformance's calibration (see recordReview in db/repository.ts and
 * the answer() callback in pages/LearnMode.tsx). Both hintUsed and the true response
 * time are logged specifically so this constant can later be replaced with a value
 * fitted from real review history, rather than left as a guess.
 */
export const HINT_TIME_PENALTY_SEC = 1.5;

/**
 * Map a "Yes/No" answer and response time to an FSRS grade.
 *  - "No" always maps to g = 1 (Again).
 *  - "Yes" maps to Easy/Good/Hard by speed, using fixed thresholds during calibration
 *    (totalCorrectReviews < 20) and mu +/- 0.75*sigma thereafter.
 */
export function gradeFromResponse(
  correct: boolean,
  responseTimeSec: number,
  perf: UserPerformance | undefined,
): Grade {
  if (!correct) return 1;

  const totalCorrect = perf?.totalCorrectReviews ?? 0;

  if (totalCorrect < CALIBRATION_THRESHOLD) {
    if (responseTimeSec < FAST_SECONDS) return 4;
    if (responseTimeSec > SLOW_SECONDS) return 2;
    return 3;
  }

  const mu = perf!.runningMeanResponseTime;
  const sigma = perf!.runningStdDevResponseTime;
  if (responseTimeSec < mu - SIGMA_FACTOR * sigma) return 4;
  if (responseTimeSec > mu + SIGMA_FACTOR * sigma) return 2;
  return 3;
}

/** An empty performance profile for a deck that has had no correct reviews yet. */
export function emptyPerformance(deckId: string): UserPerformance {
  return {
    deckId,
    runningMeanResponseTime: 0,
    runningStdDevResponseTime: 0,
    m2: 0,
    totalCorrectReviews: 0,
  };
}

/**
 * Update a deck's running mean and standard deviation of correct response times,
 * using Welford's online algorithm. Only correct reviews are folded in.
 * This is a biased sample on high-failure decks because slow failures are excluded;
 * the prediction-accuracy analytics use review outcomes to make that bias visible.
 */
export function updatePerformance(perf: UserPerformance, responseTimeSec: number): UserPerformance {
  const n = perf.totalCorrectReviews + 1;
  const delta = responseTimeSec - perf.runningMeanResponseTime;
  const mean = perf.runningMeanResponseTime + delta / n;
  const delta2 = responseTimeSec - mean;
  const m2 = perf.m2 + delta * delta2;
  const variance = m2 / n;
  return {
    deckId: perf.deckId,
    runningMeanResponseTime: mean,
    runningStdDevResponseTime: Math.sqrt(variance),
    m2,
    totalCorrectReviews: n,
  };
}
