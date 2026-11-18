// Deck-level retrievability metrics used by the progress bar and analytics.
// These read exam-day retrievability from the forward-simulation layer so they
// always agree with the scheduler (see src/fsrs/objective.ts).

import { rAtExam } from '@lacuna/core/fsrs/forwardSim';
import { modelOf } from '@lacuna/core/fsrs/fsrs';
import { cardSchedulingHorizon } from '@lacuna/core/fsrs/horizon';
import { MASTERY_R } from '@lacuna/core/fsrs/params';
import type { ExamDateContext } from '@lacuna/core/fsrs/examDate';
import type { Card, SchedulerConfig } from '@lacuna/core/db/types';

/** Predicted retrievability for one card at its applicable scheduling horizon. */
export function predictedRetrievabilityAtHorizon(
  card: Card,
  deck: SchedulerConfig,
  now: number = Date.now(),
  examDateContext?: ExamDateContext,
): number | null {
  return rAtExam(
    card,
    cardSchedulingHorizon(card, deck, examDateContext, now),
    now,
    modelOf(deck.fsrsParameters),
  );
}

/** Fraction (0..1) of cards predicted to be at or above the mastery threshold on exam day. */
export function masteryFraction(
  cards: Card[],
  deck: SchedulerConfig,
  now: number = Date.now(),
  examDateContext?: ExamDateContext,
): number | null {
  if (cards.length === 0) return 1;
  const predictions = cards.map((card) =>
    predictedRetrievabilityAtHorizon(card, deck, now, examDateContext),
  );
  if (predictions.some((value) => value === null)) return null;
  return predictions.filter((value) => value !== null && value >= MASTERY_R).length / cards.length;
}

/** Average predicted exam-day retrievability across a deck (0..1). */
export function averagePredictedRetrievability(
  cards: Card[],
  deck: SchedulerConfig,
  now: number = Date.now(),
  examDateContext?: ExamDateContext,
): number | null {
  if (cards.length === 0) return 1;
  const predictions = cards.map((card) =>
    predictedRetrievabilityAtHorizon(card, deck, now, examDateContext),
  );
  if (predictions.some((value) => value === null)) return null;
  const total = predictions.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total / cards.length;
}
