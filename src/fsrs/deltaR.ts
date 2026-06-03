// Delta-R queue scoring for Learn mode.
//
// Each card is scored by the expected increase in exam-day retrievability from
// reviewing it now (see forwardSim.deltaR); the queue is sorted in descending
// order of that gain. This is the correct greedy metric for the "expectedMarks"
// objective. The objective-aware wrapper lives in src/fsrs/objective.ts.

import { makeEngine } from './fsrs';
import { deltaR as deltaRForward, simContext } from './forwardSim';
import type { Card, Deck } from '../db/types';

/** Delta-R for a single card, using the deck's FSRS-6 parameters. */
export function deltaR(card: Card, deck: Deck, now: number = Date.now()): number {
  const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
  return deltaRForward(card, deck.examDate, now, ctx);
}

export interface ScoredCard {
  card: Card;
  delta: number;
}

/** Score and sort all cards in descending order of Delta-R (one engine per sort). */
export function sortedByDeltaR(
  cards: Card[],
  deck: Deck,
  now: number = Date.now(),
): ScoredCard[] {
  const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
  return cards
    .map((card) => ({ card, delta: deltaRForward(card, deck.examDate, now, ctx) }))
    .sort((a, b) => b.delta - a.delta);
}
