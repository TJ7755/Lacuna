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
import type { ExamDateContext } from './examDate';
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
  /** Per-card course exam dates. Omitted for legacy Deck scheduling. */
  examDateContext?: ExamDateContext;
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

interface SessionCardIndex {
  byUnit: Map<string, Card[]>;
  unitsByCard: Map<string, SessionDeckContext[]>;
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
    const unit: SessionUnit =
      'scope' in u ? u : { config: u, scope: { kind: 'deck', deckId: u.id } };
    map.set(unitKey(unit.scope), {
      deck: unit.config,
      scope: unit.scope,
      oc: makeObjectiveContext(unit.config, unit.examDateContext),
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

/**
 * Index card membership once for a session calculation. The previous implementation
 * filtered the complete card array once per unit, then repeated much of that work
 * while scoring. Direct indexes keep the common deck/course case linear while still
 * supporting cards linked into several lesson units.
 */
function indexSessionCards(cards: Card[], ctx: SessionContext): SessionCardIndex {
  const byUnit = new Map<string, Card[]>();
  const unitsByDeck = new Map<string, SessionDeckContext[]>();
  const unitsByCourse = new Map<string, SessionDeckContext[]>();
  const unitsByPrimaryLesson = new Map<string, SessionDeckContext[]>();
  const unitsByLinkedCard = new Map<string, SessionDeckContext[]>();

  const addUnit = (
    map: Map<string, SessionDeckContext[]>,
    key: string,
    unit: SessionDeckContext,
  ) => {
    const entries = map.get(key);
    if (entries) entries.push(unit);
    else map.set(key, [unit]);
  };

  for (const unit of ctx.decks.values()) {
    byUnit.set(unitKey(unit.scope), []);
    switch (unit.scope.kind) {
      case 'deck':
        addUnit(unitsByDeck, unit.scope.deckId, unit);
        break;
      case 'course':
        addUnit(unitsByCourse, unit.scope.courseId, unit);
        break;
      case 'lesson':
        addUnit(unitsByPrimaryLesson, unit.scope.lessonId, unit);
        for (const cardId of unit.scope.linkedCardIds) addUnit(unitsByLinkedCard, cardId, unit);
        break;
    }
  }

  const unitsByCard = new Map<string, SessionDeckContext[]>();
  for (const card of cards) {
    const matches = new Set<SessionDeckContext>();
    for (const unit of unitsByDeck.get(card.deckId) ?? []) matches.add(unit);
    if (card.courseId) {
      for (const unit of unitsByCourse.get(card.courseId) ?? []) matches.add(unit);
    }
    if (card.primaryLessonId) {
      for (const unit of unitsByPrimaryLesson.get(card.primaryLessonId) ?? []) matches.add(unit);
    }
    for (const unit of unitsByLinkedCard.get(card.id) ?? []) matches.add(unit);

    if (matches.size === 0) continue;
    const matchedUnits = [...matches];
    unitsByCard.set(card.id, matchedUnits);
    for (const unit of matchedUnits) byUnit.get(unitKey(unit.scope))!.push(card);
  }

  return { byUnit, unitsByCard };
}

/** Apply the eligibility rules for one unit consistently across selection and completion. */
function unitServePool(
  cards: Card[],
  deck: SchedulerConfig,
  mode: SessionMode,
  now: number,
): Card[] {
  if (deck.archived) return [];
  return mode === 'cram' ? availableCards(cards, now) : studyPool(cards, deck, now);
}

function indexedUnitsForCard(
  card: Card,
  index: SessionCardIndex,
): SessionDeckContext[] {
  return index.unitsByCard.get(card.id) ?? [];
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

/** The cards a session may serve right now (studyPool per unit, unioned and
 *  deduplicated by card id — a card linked into more than one lesson unit via
 *  LessonCardLink would otherwise be counted once per matching unit).
 *  In cram mode the new-card cap is bypassed so every card is available. */
export function sessionServePool(
  cards: Card[],
  ctx: SessionContext,
  now: number = Date.now(),
): Card[] {
  return sessionServePoolFromIndex(indexSessionCards(cards, ctx), ctx, now);
}

function sessionServePoolFromIndex(
  index: SessionCardIndex,
  ctx: SessionContext,
  now: number,
): Card[] {
  const seen = new Set<string>();
  const pool: Card[] = [];
  for (const { deck, scope } of ctx.decks.values()) {
    const deckCards = index.byUnit.get(unitKey(scope)) ?? [];
    const eligible = unitServePool(deckCards, deck, ctx.mode, now);
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
  const index = indexSessionCards(cards, ctx);
  const pool = sessionServePoolFromIndex(index, ctx, now);
  if (pool.length === 0) return null;

  if (ctx.mode === 'cram') {
    // Exam-eve cram: weakest predicted exam-day card first, across every unit in
    // the session. Cooldown-eligible cards win; otherwise serve the soonest.
    const cramPriority = new Map<string, number>();
    for (const card of pool) {
      const units = indexedUnitsForCard(card, index);
      const dc =
        units.length <= 1
          ? units[0]
          : resolveScoringUnit(card, units, (unit) => cramScore(card, unit.oc, now));
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
  const poolIds = new Set(pool.map((card) => card.id));
  for (const dc of ctx.decks.values()) {
    const { deck, scope, oc } = dc;
    const deckCards = (index.byUnit.get(unitKey(scope)) ?? []).filter((card) =>
      poolIds.has(card.id),
    );
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
    const units = indexedUnitsForCard(card, index);
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

  const scored = pool.slice().sort((a, b) => (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0));

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
  const index = indexSessionCards(cards, ctx);
  let anyPoolNonEmpty = false;
  for (const { deck, scope, oc } of ctx.decks.values()) {
    const served = unitServePool(
      index.byUnit.get(unitKey(scope)) ?? [],
      deck,
      ctx.mode,
      now,
    );
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
  const index = indexSessionCards(cards, ctx);
  let total = 0;
  let acc = 0;
  for (const { deck, scope, oc } of ctx.decks.values()) {
    const available = availableCards(index.byUnit.get(unitKey(scope)) ?? [], now);
    if (available.length === 0) continue;
    acc += progressValue(available, deck, now, oc.examDateContext) * available.length;
    total += available.length;
  }
  return total ? acc / total : 1;
}
