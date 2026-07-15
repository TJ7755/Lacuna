// Deck-level retrievability metrics used by the progress bar and analytics.
// These read exam-day retrievability from the forward-simulation layer so they
// always agree with the scheduler (see src/fsrs/objective.ts).

import { rAtExam } from './forwardSim';
import { decayOf } from './fsrs';
import { cardSchedulingHorizon } from './horizon';
import { MASTERY_R } from './params';
import type { ExamDateContext } from './examDate';
import type { Card, SchedulerConfig } from '../db/types';

/** The deck's forgetting-curve decay exponent (= -w20).
 *  Accepts any SchedulerConfig (a Deck or a Course). */
function deckDecay(deck: SchedulerConfig): number {
  return decayOf(deck.fsrsParameters);
}

/** Fraction (0..1) of cards predicted to be at or above the mastery threshold on exam day. */
export function masteryFraction(
  cards: Card[],
  deck: SchedulerConfig,
  now: number = Date.now(),
  examDateContext?: ExamDateContext,
): number {
  if (cards.length === 0) return 1;
  const decay = deckDecay(deck);
  const mastered = cards.filter(
    (card) =>
      rAtExam(
        card,
        cardSchedulingHorizon(card, deck, examDateContext, now),
        now,
        decay,
      ) >= MASTERY_R,
  ).length;
  return mastered / cards.length;
}

/** Average predicted exam-day retrievability across a deck (0..1). */
export function averagePredictedRetrievability(
  cards: Card[],
  deck: SchedulerConfig,
  now: number = Date.now(),
  examDateContext?: ExamDateContext,
): number {
  if (cards.length === 0) return 1;
  const decay = deckDecay(deck);
  const total = cards.reduce(
    (sum, card) =>
      sum +
      rAtExam(
        card,
        cardSchedulingHorizon(card, deck, examDateContext, now),
        now,
        decay,
      ),
    0,
  );
  return total / cards.length;
}
