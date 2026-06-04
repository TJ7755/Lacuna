// Multi-deck study-session engine.
//
// A Learn session may study a single deck (the classic per-deck route) or every
// deck at once (the global "Today" session). Both cases run through here so the
// scheduler ordering and the progress bar stay derived from each deck's exam
// objective (see objective.ts) and from the eligibility rules (see eligibility.ts).
//
// Single deck: ordering is exactly the per-deck objective order (delegated to
// cooldown.selectNextCard) so behaviour is unchanged. Multiple decks: each card is
// scored by its own deck's objective, those scores are normalised within the deck,
// and weighted by an exam-proximity urgency so nearer exams are served first.

import {
  makeObjectiveContext,
  isObjectiveComplete,
  progressValue,
  scoreCard,
  type ObjectiveContext,
} from './objective';
import { selectNextCard, type CooldownMap } from './cooldown';
import { studyPool } from './eligibility';
import { schedulingHorizon } from './horizon';
import { daysUntil } from '../utils/datetime';
import type { Card, Deck } from '../db/types';

/** Per-deck scoring context held for the life of a session. */
export interface SessionDeckContext {
  deck: Deck;
  oc: ObjectiveContext;
}

/** A whole session's deck contexts, keyed by deck id. */
export interface SessionContext {
  decks: Map<string, SessionDeckContext>;
}

/** Build the session context once from the decks being studied. */
export function makeSessionContext(decks: Deck[]): SessionContext {
  const map = new Map<string, SessionDeckContext>();
  for (const deck of decks) {
    map.set(deck.id, { deck, oc: makeObjectiveContext(deck) });
  }
  return { decks: map };
}

/** Exam-proximity urgency: nearer exams weigh more. Smooth and always positive.
 * Uses the scheduling horizon so a passed exam falls back to its rolling
 * maintenance horizon rather than reading as maximally urgent forever. */
export function urgency(deck: Deck, now: number = Date.now()): number {
  return 1 / (1 + daysUntil(schedulingHorizon(deck, now), now));
}

function cardsOfDeck(cards: Card[], deckId: string): Card[] {
  return cards.filter((c) => c.deckId === deckId);
}

/** The cards a session may serve right now (studyPool per deck, unioned). */
export function sessionServePool(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): Card[] {
  const pool: Card[] = [];
  for (const { deck } of ctx.decks.values()) {
    pool.push(...studyPool(cardsOfDeck(cards, deck.id), deck, now));
  }
  return pool;
}

/**
 * Choose the next card to present. A single-deck session preserves the exact
 * per-deck objective ordering; a multi-deck session blends decks by urgency.
 */
export function selectNext(
  cards: Card[],
  ctx: SessionContext,
  cooldowns: CooldownMap,
  now: number = Date.now(),
): Card | null {
  const pool = sessionServePool(cards, ctx, now);
  if (pool.length === 0) return null;

  if (ctx.decks.size === 1) {
    const only = ctx.decks.values().next().value as SessionDeckContext;
    return selectNextCard(pool, only.oc, cooldowns, now);
  }

  // Multi-deck: normalise each deck's scores to 0..1 and weight by urgency so the
  // figures are comparable across decks with different objectives and exam dates.
  const priority = new Map<string, number>();
  for (const { deck, oc } of ctx.decks.values()) {
    const deckCards = pool.filter((c) => c.deckId === deck.id);
    if (deckCards.length === 0) continue;
    const scores = deckCards.map((c) => scoreCard(c, oc, now));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const w = urgency(deck, now);
    const span = max - min;
    const degenerate = Math.abs(span) < 1e-9;
    deckCards.forEach((c, i) => {
      const normalised = degenerate ? 1 : (scores[i] - min) / span;
      priority.set(c.id, w * normalised);
    });
  }

  const scored = pool
    .slice()
    .sort((a, b) => (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0));

  const eligible = scored.find((c) => (cooldowns.get(c.id) ?? 0) <= 0);
  if (eligible) return eligible;

  // All on cooldown: serve the soonest-eligible (scored is already priority-ordered).
  let best = scored[0];
  let bestCd = cooldowns.get(best.id) ?? 0;
  for (const c of scored) {
    const cd = cooldowns.get(c.id) ?? 0;
    if (cd < bestCd) {
      best = c;
      bestCd = cd;
    }
  }
  return best;
}

/** True when every deck's served pool has met its exam objective. */
export function sessionComplete(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): boolean {
  for (const { deck, oc } of ctx.decks.values()) {
    const served = studyPool(cardsOfDeck(cards, deck.id), deck, now);
    if (!isObjectiveComplete(served, oc, now)) return false;
  }
  return true;
}

/**
 * Combined session progress (0..1): a card-weighted mean of each deck's objective
 * progress over its served pool. For a single deck this is exactly that deck's
 * progress over the cards it is studying today.
 */
export function sessionProgress(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): number {
  let total = 0;
  let acc = 0;
  for (const { deck } of ctx.decks.values()) {
    const served = studyPool(cardsOfDeck(cards, deck.id), deck, now);
    if (served.length === 0) continue;
    acc += progressValue(served, deck, now) * served.length;
    total += served.length;
  }
  return total ? acc / total : 1;
}
