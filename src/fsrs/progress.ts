// Deck-level retrievability metrics used by the progress bar and analytics.

import { retrievability } from './fsrs';
import { MASTERY_R, MS_PER_DAY } from './params';
import type { Card, Deck } from '../db/types';

/**
 * Predicted retrievability of a single card on the exam day.
 * Measured from the card's last review to the exam date using its current stability.
 * A never-reviewed card has no stability, so its predicted retrievability is 0.
 */
export function predictedExamRetrievability(
  card: Card,
  deck: Deck,
): number {
  if (card.stability === null || card.lastReviewed === null) return 0;
  const days = Math.max(deck.examDate - card.lastReviewed, 0) / MS_PER_DAY;
  return retrievability(days, card.stability);
}

/** Fraction (0..1) of cards predicted to be at or above the mastery threshold on exam day. */
export function masteryFraction(cards: Card[], deck: Deck): number {
  if (cards.length === 0) return 1;
  const mastered = cards.filter(
    (c) => predictedExamRetrievability(c, deck) >= MASTERY_R,
  ).length;
  return mastered / cards.length;
}

/** Average predicted exam-day retrievability across a deck (0..1). */
export function averagePredictedRetrievability(cards: Card[], deck: Deck): number {
  if (cards.length === 0) return 0;
  const total = cards.reduce(
    (sum, c) => sum + predictedExamRetrievability(c, deck),
    0,
  );
  return total / cards.length;
}
