// Multi-unit study-session engine.
//
// A Learn session may study a single deck (the classic per-deck route), every
// deck at once (the global "Today" session), or a course/lesson scope (course-
// architecture migration). All cases run through here so the scheduler ordering
// and the progress bar stay derived from each unit's exam objective (see
// objective.ts) and from the eligibility rules (see eligibility.ts).
//
// Single unit: ordering is exactly the per-unit objective order (delegated to
// cooldown.selectNextCard) so behaviour is unchanged. Multiple units: each card is
// scored by its own unit's objective, those scores are normalised within the unit,
// and weighted by an exam-proximity urgency so nearer exams are served first.
//
// A "unit" is anything satisfying SchedulerConfig (a Deck or a Course) paired with
// a SessionUnitScope describing which cards belong to it: a deck's own cards, a
// lesson's cards (primaryLessonId match, plus any cards linked in via
// LessonCardLink), or a whole course's cards (courseId match).

import {
  makeObjectiveContext,
  isObjectiveComplete,
  progressValue,
  scoreCard,
  type ObjectiveContext,
} from './objective';
import { selectNextCard, type CooldownMap } from './cooldown';
import { studyPool, availableCards } from './eligibility';
import { schedulingHorizon } from './horizon';
import { cramScore } from './cram';
import { daysUntil } from '../utils/datetime';
import type { Card, Deck, SchedulerConfig } from '../db/types';

/** How a session orders cards: by the unit objective, or exam-eve cram (weakest first). */
export type SessionMode = 'objective' | 'cram';

/**
 * Which cards belong to a session unit, and the key under which its context is
 * stored in {@link SessionContext.decks}.
 *  - `deck`: the classic per-deck/global-Today scope — cards with a matching deckId.
 *  - `course`: every card in the course — cards with a matching courseId.
 *  - `lesson`: a single lesson's cards — primaryLessonId match, plus any cards
 *    linked in from elsewhere via LessonCardLink (see db/types.ts).
 */
type SessionUnitScope =
  | { kind: 'deck'; deckId: string }
  | { kind: 'course'; courseId: string }
  | { kind: 'lesson'; courseId: string; lessonId: string; linkedCardIds: ReadonlySet<string> };

/** A unit to study: its scheduling config (Deck or Course) plus its card scope. */
export interface SessionUnit {
  config: SchedulerConfig;
  scope: SessionUnitScope;
}

function unitKey(scope: SessionUnitScope): string {
  switch (scope.kind) {
    case 'deck':
      return scope.deckId;
    case 'course':
      return scope.courseId;
    case 'lesson':
      return scope.lessonId;
  }
}

function cardMatchesScope(card: Card, scope: SessionUnitScope): boolean {
  switch (scope.kind) {
    case 'deck':
      return card.deckId === scope.deckId;
    case 'course':
      return card.courseId === scope.courseId;
    case 'lesson':
      return card.primaryLessonId === scope.lessonId || scope.linkedCardIds.has(card.id);
  }
}

/** Per-unit scoring context held for the life of a session. */
interface SessionDeckContext {
  /** The unit's scheduling config — a Deck (deck scope) or a Course (lesson/course scope). */
  deck: SchedulerConfig;
  scope: SessionUnitScope;
  oc: ObjectiveContext;
}

/** A whole session's unit contexts, keyed by {@link unitKey}. */
export interface SessionContext {
  decks: Map<string, SessionDeckContext>;
  /** Ordering mode for the session. Defaults to the unit objective. */
  mode: SessionMode;
}

/**
 * Build the session context once from the units being studied. Accepts either the
 * legacy `Deck[]` (per-deck route and global "Today" session, unchanged) or an
 * explicit `SessionUnit[]` for course/lesson-scoped sessions.
 */
export function makeSessionContext(
  units: Deck[] | SessionUnit[],
  mode: SessionMode = 'objective',
): SessionContext {
  const map = new Map<string, SessionDeckContext>();
  for (const u of units) {
    const unit: SessionUnit = 'scope' in u ? u : { config: u, scope: { kind: 'deck', deckId: u.id } };
    map.set(unitKey(unit.scope), {
      deck: unit.config,
      scope: unit.scope,
      oc: makeObjectiveContext(unit.config),
    });
  }
  return { decks: map, mode };
}

/** Exam-proximity urgency: nearer exams weigh more. Smooth and always positive.
 * Uses the scheduling horizon so a passed exam falls back to its rolling
 * maintenance horizon rather than reading as maximally urgent forever. */
function urgency(deck: SchedulerConfig, now: number = Date.now()): number {
  return 1 / (1 + daysUntil(schedulingHorizon(deck, now), now));
}

function cardsOfUnit(cards: Card[], scope: SessionUnitScope): Card[] {
  return cards.filter((c) => cardMatchesScope(c, scope));
}

/** Lightweight per-call cache so sessionComplete and sessionProgress don't re-filter
 *  the same unit's cards repeatedly when called in quick succession. */
function getUnitCards(
  cards: Card[],
  scope: SessionUnitScope,
  cache: Map<string, Card[]>,
): Card[] {
  const key = unitKey(scope);
  let result = cache.get(key);
  if (!result) {
    result = cardsOfUnit(cards, scope);
    cache.set(key, result);
  }
  return result;
}

/** All units whose scope matches a card. Usually a single entry, but a card
 *  linked into another lesson via LessonCardLink matches its own lesson's unit
 *  *and* every lesson unit it's linked into (see cardMatchesScope). */
function unitsForCard(card: Card, ctx: SessionContext): SessionDeckContext[] {
  const out: SessionDeckContext[] = [];
  for (const dc of ctx.decks.values()) {
    if (cardMatchesScope(card, dc.scope)) out.push(dc);
  }
  return out;
}

/** Resolve the single unit that should score a card matching more than one unit:
 *  the unit that owns the card (its primaryLessonId) when that unit is amongst
 *  the matches, otherwise whichever matching unit gives it the best (most
 *  urgent/highest) score — so a shared card's priority is deterministic
 *  regardless of unit registration order. */
function resolveScoringUnit(
  card: Card,
  units: SessionDeckContext[],
  scoreFn: (dc: SessionDeckContext) => number,
): SessionDeckContext {
  const owner = units.find(
    (dc) => dc.scope.kind === 'lesson' && dc.scope.lessonId === card.primaryLessonId,
  );
  if (owner) return owner;
  return units.reduce((best, dc) => (scoreFn(dc) > scoreFn(best) ? dc : best));
}

/** Find the unit a served card belongs to (matched by scope, not deckId, so
 *  course/lesson-scoped units resolve correctly for shadow-decked cards). When
 *  a card matches more than one unit (linked into several lessons), resolves
 *  deterministically via {@link resolveScoringUnit} rather than returning
 *  whichever unit happens to iterate first. */
function findUnit(card: Card, ctx: SessionContext, now: number = Date.now()): SessionDeckContext | undefined {
  const units = unitsForCard(card, ctx);
  if (units.length === 0) return undefined;
  if (units.length === 1) return units[0];
  return resolveScoringUnit(card, units, (dc) => cramScore(card, dc.oc, now));
}

/** The cards a session may serve right now (studyPool per unit, unioned and
 *  deduplicated by card id — a card linked into more than one lesson unit via
 *  LessonCardLink would otherwise be counted once per matching unit).
 *  In cram mode the new-card cap is bypassed so every card is available. */
export function sessionServePool(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): Card[] {
  const seen = new Set<string>();
  const pool: Card[] = [];
  for (const { deck, scope } of ctx.decks.values()) {
    // Archived decks/courses are excluded from all study modes.
    if (deck.archived) continue;
    const deckCards = cardsOfUnit(cards, scope);
    const eligible =
      ctx.mode === 'cram'
        ? // Cram serves every available card, ignoring the daily new-card cap.
          deckCards.filter(
            (c) => !c.suspended && !(c.buriedUntil !== null && c.buriedUntil !== undefined && c.buriedUntil > now),
          )
        : studyPool(deckCards, deck, now);
    for (const c of eligible) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      pool.push(c);
    }
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

  if (ctx.mode === 'cram') {
    // Exam-eve cram: weakest predicted exam-day card first, across every unit in
    // the session. Cooldown-eligible cards win; otherwise serve the soonest.
    const cramPriority = new Map<string, number>();
    for (const card of pool) {
      const dc = findUnit(card, ctx, now);
      if (dc) cramPriority.set(card.id, cramScore(card, dc.oc, now));
    }
    const ordered = pool
      .slice()
      .sort((a, b) => (cramPriority.get(b.id) ?? 0) - (cramPriority.get(a.id) ?? 0));
    const ready = ordered.find((c) => (cooldowns.get(c.id) ?? 0) <= 0);
    if (ready) return ready;
    return ordered.reduce((best, c) =>
      (cooldowns.get(c.id) ?? 0) < (cooldowns.get(best.id) ?? 0) ? c : best,
    );
  }

  if (ctx.decks.size === 1) {
    const only = ctx.decks.values().next().value as SessionDeckContext;
    return selectNextCard(pool, only.oc, cooldowns, now);
  }

  // Multi-unit: normalise each unit's scores to 0..1 and weight by urgency so the
  // figures are comparable across units with different objectives and exam dates.
  // Each unit's normalised value is kept per-unit (perUnitPriority) so a card
  // shared across units can be resolved deterministically afterwards, instead
  // of last-write-wins over Map iteration order.
  const perUnitPriority = new Map<string, Map<string, number>>();
  for (const dc of ctx.decks.values()) {
    const { deck, scope, oc } = dc;
    const deckCards = pool.filter((c) => cardMatchesScope(c, scope));
    if (deckCards.length === 0) continue;
    const scores = deckCards.map((c) => scoreCard(c, oc, now));
    const min = scores.reduce((a, b) => Math.min(a, b), Infinity);
    const max = scores.reduce((a, b) => Math.max(a, b), -Infinity);
    const w = urgency(deck, now);
    const span = max - min;
    const degenerate = Math.abs(span) < 1e-9;
    const values = new Map<string, number>();
    deckCards.forEach((c, i) => {
      const normalised = degenerate ? 0.5 : (scores[i] - min) / span;
      values.set(c.id, w * normalised);
    });
    perUnitPriority.set(unitKey(scope), values);
  }

  const priority = new Map<string, number>();
  for (const card of pool) {
    const units = unitsForCard(card, ctx);
    if (units.length === 0) continue;
    const dc =
      units.length === 1
        ? units[0]
        : resolveScoringUnit(
            card,
            units,
            (u) => perUnitPriority.get(unitKey(u.scope))?.get(card.id) ?? -Infinity,
          );
    priority.set(card.id, perUnitPriority.get(unitKey(dc.scope))?.get(card.id) ?? 0);
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

/** True when every unit's served pool has met its exam objective. */
export function sessionComplete(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): boolean {
  const unitCache = new Map<string, Card[]>();
  let anyPoolNonEmpty = false;
  for (const { deck, scope, oc } of ctx.decks.values()) {
    const served = studyPool(getUnitCards(cards, scope, unitCache), deck, now);
    if (served.length > 0) anyPoolNonEmpty = true;
    if (!isObjectiveComplete(served, oc, now)) return false;
  }
  return anyPoolNonEmpty;
}

/**
 * Combined session progress (0..1): a card-weighted mean of each unit's objective
 * progress over its available cards (not suspended/buried). For a single unit this
 * is exactly that unit's progress, consistent with the dashboard denominator.
 */
export function sessionProgress(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): number {
  const unitCache = new Map<string, Card[]>();
  let total = 0;
  let acc = 0;
  for (const { deck, scope } of ctx.decks.values()) {
    const available = availableCards(getUnitCards(cards, scope, unitCache), now);
    if (available.length === 0) continue;
    acc += progressValue(available, deck, now) * available.length;
    total += available.length;
  }
  return total ? acc / total : 1;
}
