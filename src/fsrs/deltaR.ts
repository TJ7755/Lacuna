// Selection optimisation for Learn mode: the Delta-R queue.
// Each card is scored by the expected increase in exam-day retrievability from
// reviewing it now; the queue is sorted in descending order of that gain.

import { retrievability } from './fsrs';
import { W, FACTOR, DECAY } from './params';
import { MS_PER_DAY } from './params';
import type { Card, Deck } from '../db/types';

/** Retrievability helper that accepts day-units directly (mirrors the spec's R formula). */
function rAt(days: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * (Math.max(days, 0) / stability), DECAY);
}

/**
 * Compute Delta R for a single card.
 *
 * Brand-new card (never reviewed):
 *   R_no_review = 0
 *   R_with_review uses an assumed Good initial stability S_new = w[2] (3.71 days),
 *     measured over the full time to the exam.
 *   Delta R = R_with_review - 0
 *
 * Previously reviewed card:
 *   d_exam_remaining = (examDate - now) in days
 *   d_total_to_exam  = (examDate - lastReviewed) in days
 *   R_no_review  = R(d_total_to_exam, S)
 *   S_new        = stability assuming a "Good" (g = 3) review today
 *   R_with_review = R(d_exam_remaining, S_new)
 *   Delta R = R_with_review - R_no_review
 */
export function deltaR(card: Card, deck: Deck, now: number = Date.now()): number {
  const dExamRemaining = Math.max(deck.examDate - now, 0) / MS_PER_DAY;

  if (card.stability === null || card.lastReviewed === null) {
    // Brand-new card: assume a Good initial stability of w[2].
    const rWith = rAt(dExamRemaining, W[2]);
    return rWith - 0;
  }

  const dTotalToExam = Math.max(deck.examDate - card.lastReviewed, 0) / MS_PER_DAY;
  const rNo = rAt(dTotalToExam, card.stability);

  // Stability if the user scores "Good" (g = 3) today.
  const elapsed = Math.max(now - card.lastReviewed, 0) / MS_PER_DAY;
  const rNow = retrievability(elapsed, card.stability);
  const difficulty = card.difficulty ?? 5;
  const sNew = goodStability(card.stability, difficulty, rNow);

  const rWith = rAt(dExamRemaining, sNew);
  return rWith - rNo;
}

/** Stability after a hypothetical "Good" (g = 3) success, used for queue scoring. */
function goodStability(stability: number, difficulty: number, r: number): number {
  // f_g = 1.0 for g == 3.
  return (
    stability *
    (1 +
      Math.exp(W[8]) *
        (11 - difficulty) *
        Math.pow(stability, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1))
  );
}

export interface ScoredCard {
  card: Card;
  delta: number;
}

/** Score and sort all cards in descending order of Delta R. */
export function sortedByDeltaR(
  cards: Card[],
  deck: Deck,
  now: number = Date.now(),
): ScoredCard[] {
  return cards
    .map((card) => ({ card, delta: deltaR(card, deck, now) }))
    .sort((a, b) => b.delta - a.delta);
}
