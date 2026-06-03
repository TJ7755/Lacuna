// FSRS-4.5 scheduler: forgetting curve and state-update equations.
// Implemented exactly per the specification.

import { W, FACTOR, DECAY, D_MIN, D_MAX, S_MIN } from './params';
import type { Grade } from '../db/types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Retrievability at elapsed time t (days) for stability S (days):
 *   R(t, S) = (1 + (19/81) * (t / S))^-0.5
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  const t = Math.max(elapsedDays, 0);
  return Math.pow(1 + FACTOR * (t / stability), DECAY);
}

export interface FsrsState {
  stability: number;
  difficulty: number;
}

/** Initial stability for a first review: S_0 = w[g - 1]. */
export function initialStability(grade: Grade): number {
  return W[grade - 1];
}

/** Initial difficulty for a first review: D_0 = clamp(w[4] - (g - 1) * w[5], 1, 10). */
export function initialDifficulty(grade: Grade): number {
  return clamp(W[4] - (grade - 1) * W[5], D_MIN, D_MAX);
}

/** Difficulty update for a subsequent review: D_new = clamp(D - w[6] * (g - 3), 1, 10). */
export function nextDifficulty(difficulty: number, grade: Grade): number {
  return clamp(difficulty - W[6] * (grade - 3), D_MIN, D_MAX);
}

/**
 * Stability after a successful recall (g > 1):
 *   f_g = w[15] if g == 2, 1.0 if g == 3, w[16] if g == 4
 *   S_new = S * (1 + exp(w[8]) * (11 - D) * S^-w[9] * (exp(w[10] * (1 - R)) - 1) * f_g)
 */
export function stabilityAfterSuccess(
  stability: number,
  difficulty: number,
  retriev: number,
  grade: Grade,
): number {
  const fg = grade === 2 ? W[15] : grade === 4 ? W[16] : 1.0;
  return (
    stability *
    (1 +
      Math.exp(W[8]) *
        (11 - difficulty) *
        Math.pow(stability, -W[9]) *
        (Math.exp(W[10] * (1 - retriev)) - 1) *
        fg)
  );
}

/**
 * Stability after a failed recall (g == 1):
 *   S_new = min(w[11] * D^-w[12] * ((S + 1)^w[13] - 1) * exp(w[14] * (1 - R)), S)
 *   S_new = max(S_new, 0.1)
 */
export function stabilityAfterFailure(
  stability: number,
  difficulty: number,
  retriev: number,
): number {
  const candidate =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - retriev));
  return Math.max(Math.min(candidate, stability), S_MIN);
}

export interface ReviewInput {
  stability: number | null;
  difficulty: number | null;
  /** Retrievability at review time; required for subsequent reviews, ignored on the first. */
  retriev: number | null;
  grade: Grade;
}

/**
 * Apply a grade and return the new FSRS state. Handles both the first review
 * (stability/difficulty null) and subsequent reviews, success and failure.
 */
export function applyReview(input: ReviewInput): FsrsState {
  const { stability, difficulty, retriev, grade } = input;

  // First review: stability and difficulty are null.
  if (stability === null || difficulty === null) {
    return {
      stability: initialStability(grade),
      difficulty: initialDifficulty(grade),
    };
  }

  const newDifficulty = nextDifficulty(difficulty, grade);
  const r = retriev ?? retrievability(0, stability);

  const newStability =
    grade > 1
      ? stabilityAfterSuccess(stability, newDifficulty, r, grade)
      : stabilityAfterFailure(stability, newDifficulty, r);

  return { stability: newStability, difficulty: newDifficulty };
}
