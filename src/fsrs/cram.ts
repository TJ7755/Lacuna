// Exam-eve cram mode.
//
// The product's whole pitch is exam-day scheduling, but the moment users actually
// open the app under pressure is the night before. In the final hours, maximising
// long-term retention is the wrong objective: what matters is getting as many
// cards as possible over the line before the deadline. Cram mode is an explicit
// mode the user enters (never a silent behaviour change); it reorders study to put
// the weakest cards first and de-emphasises long-term stability.
//
// It stays objective-aware:
//   - securedTopics: drive cards towards 0.90, weakest first, and stop bothering
//     with cards already secured.
//   - expectedMarks: spend the remaining time where it lifts the exam-day R sum
//     most, which is again the weakest cards (they have the most headroom).
//
// Both reduce to "weakest predicted exam-day retrievability first", with
// already-finished cards pushed to the back.

import { rAtExam } from './forwardSim';
import { cardSchedulingHorizon } from './horizon';
import { MASTERY_R } from './params';
import type { ObjectiveContext } from './objective';
import type { Card, SchedulerConfig } from '../db/types';

/** How close to the exam cram mode becomes available (and sensible). */
export const EXAM_EVE_WINDOW_HOURS = 48;

/** Whether the deck is inside the exam-eve window: exam ahead but within the window.
 *  Accepts any SchedulerConfig (a Deck or a Course). */
export function examEveAvailable(deck: SchedulerConfig, now: number = Date.now()): boolean {
  if (deck.archived) return false;
  const msUntil = deck.examDate - now;
  return msUntil > 0 && msUntil <= EXAM_EVE_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * Cram priority for a card: higher is served sooner. Weakest predicted exam-day
 * retrievability first. A card already finished for the deck's objective (secured
 * under securedTopics, effectively certain under expectedMarks) is pushed below
 * every still-improvable card so cram time is never spent on it.
 */
export function cramScore(
  card: Card,
  oc: ObjectiveContext,
  now: number = Date.now(),
): number {
  const horizon = cardSchedulingHorizon(card, oc.deck, oc.examDateContext, now);
  const rNo = rAtExam(card, horizon, now, oc.ctx.decay);

  const finished =
    oc.objective === 'securedTopics' ? rNo >= MASTERY_R : rNo >= 0.999;
  // Weakest first: 1 - rNo rises as the card gets weaker. Finished cards are
  // shifted into a strictly lower band (negative) so they always rank last.
  return finished ? rNo - 2 : 1 - rNo;
}

/** Cards ordered for cram study: weakest first, finished cards last. */
export function cramOrder(
  cards: Card[],
  oc: ObjectiveContext,
  now: number = Date.now(),
): Card[] {
  return cards
    .map((card) => ({ card, score: cramScore(card, oc, now) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.card);
}
