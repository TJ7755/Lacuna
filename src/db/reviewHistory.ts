import type { Card, ReviewLog } from './types';

/** A review event in the canonical append-only history store. */
export interface ReviewHistoryEntry extends ReviewLog {
  /** Stable store primary key. Event-backed rows use the event id directly. */
  id: string;
  cardId: string;
  /** Legacy import provenance only. */
  deckId?: string;
  courseId?: string | null;
  primaryLessonId?: string | null;
  schedulingUnitId?: string;
}

/**
 * The durable Card projection deliberately excludes review evidence. Runtime
 * readers hydrate `history` through the canonical review-event store, while
 * keeping an empty array here preserves the long-standing Card interface for
 * callers that only need scheduling or authoring fields.
 */
export function projectCardForStorage(card: Card): Card {
  return Array.isArray(card.history) && card.history.length === 0
    ? card
    : { ...card, history: [] };
}

export function projectCardsForStorage(cards: readonly Card[]): Card[] {
  return cards.map(projectCardForStorage);
}

/** Stable key for a review written after event ids became mandatory. */
export function reviewHistoryEntryIdForEvent(eventId: string): string {
  return `review:event:${encodeURIComponent(eventId)}`;
}

/**
 * Build a deterministic id for one legacy card-history row.
 *
 * Legacy rows have no event identity. Their complete serialised value is therefore
 * part of the key, while an occurrence suffix preserves genuinely identical duplicate
 * rows without making reordering distinct rows create new ids.
 */
export function reviewHistoryEntryId(cardId: string, review: ReviewLog, occurrence = 0): string {
  if (review.eventId) return reviewHistoryEntryIdForEvent(review.eventId);
  const identity = encodeURIComponent(JSON.stringify(review));
  return `review:legacy:${encodeURIComponent(cardId)}:${identity}${occurrence > 0 ? `:${occurrence}` : ''}`;
}

/** Convert one Card.history array into canonical event rows without mutating the Card. */
export function reviewHistoryEntriesForCard(card: Card): ReviewHistoryEntry[] {
  // A few pre-v2/imported records were observed without a history property. Treat
  // those as cards with no events rather than aborting a whole schema upgrade.
  const history = Array.isArray(card.history) ? card.history : [];
  const occurrences = new Map<string, number>();
  return history.map((review) => {
    const baseId = review.eventId
      ? reviewHistoryEntryIdForEvent(review.eventId)
      : reviewHistoryEntryId(card.id, review);
    const occurrence = occurrences.get(baseId) ?? 0;
    occurrences.set(baseId, occurrence + 1);
    return {
      ...review,
      id: occurrence === 0 ? baseId : `${baseId}:${occurrence}`,
      cardId: card.id,
      deckId: card.deckId,
      courseId: card.courseId,
      primaryLessonId: card.primaryLessonId,
      schedulingUnitId: card.schedulingUnitId,
    };
  });
}

/** Convert one runtime review into its canonical event row. */
export function reviewHistoryEntryForCard(
  card: Card,
  review: ReviewLog,
): ReviewHistoryEntry {
  return {
    ...review,
    id: reviewHistoryEntryId(card.id, review),
    cardId: card.id,
    deckId: card.deckId,
    courseId: card.courseId,
    primaryLessonId: card.primaryLessonId,
    schedulingUnitId: card.schedulingUnitId,
  };
}

/**
 * Rebuild card projections from an explicit canonical result. An explicit empty
 * result clears every projection rather than falling back to stale Card.history.
 */
export function cardsWithReviewHistory(
  cards: Card[],
  entries: ReviewHistoryEntry[],
): Card[] {
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of entries) {
    const history = byCard.get(entry.cardId) ?? [];
    history.push(entry);
    byCard.set(entry.cardId, history);
  }

  return cards.map((card) => {
    const history = (byCard.get(card.id) ?? [])
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
      .map((entry): ReviewLog => {
        const {
          id: _id,
          cardId: _cardId,
          deckId: _deckId,
          courseId: _courseId,
          primaryLessonId: _primaryLessonId,
          schedulingUnitId: _schedulingUnitId,
          ...review
        } = entry;
        return review;
      });
    return { ...card, history };
  });
}

/**
 * Union canonical rows with rows reconstructed from cards. Earlier entries win so
 * an existing canonical row is not overwritten by a stale card projection; event ids
 * also deduplicate rows whose legacy primary-key scheme differed across backups.
 */
export interface ReviewHistoryCollisionState {
  usedIds: Set<string>;
  eventOwners: Map<string, string>;
  /**
   * Optional identity tracking. Import/merge paths use it to make replayed rows
   * idempotent; the schema migration omits it so it does not retain a full JSON
   * copy of every historical event in memory.
   */
  entryIdentities?: Map<string, string>;
}

function reviewHistoryEntryIdentity(entry: ReviewHistoryEntry): string {
  // These ownership fields are compatibility metadata projected from the Card. The
  // canonical row may have been written before a later scheduling-unit backfill, so
  // they must not make the same review event look like a distinct event during backup
  // export/import. Event content and event ownership are handled separately below.
  const {
    id: _id,
    cardId: _cardId,
    deckId: _deckId,
    courseId: _courseId,
    primaryLessonId: _primaryLessonId,
    schedulingUnitId: _schedulingUnitId,
    ...identity
  } = entry;
  return JSON.stringify(identity);
}

export function resolveReviewHistoryCollisions(
  entries: ReviewHistoryEntry[],
  state: ReviewHistoryCollisionState = {
    usedIds: new Set(),
    eventOwners: new Map(),
    entryIdentities: new Map(),
  },
): ReviewHistoryEntry[] {
  const resolved: ReviewHistoryEntry[] = [];
  for (const entry of entries) {
    const identity = reviewHistoryEntryIdentity(entry);
    if (
      state.usedIds.has(entry.id) &&
      state.entryIdentities?.get(entry.id) === identity
    ) {
      continue;
    }
    const owner = entry.eventId ? state.eventOwners.get(entry.eventId) : undefined;
    if (owner && owner !== entry.cardId) {
      let collision = `${entry.id}:card:${encodeURIComponent(entry.cardId)}`;
      if (state.usedIds.has(collision)) {
        if (state.entryIdentities?.get(collision) === identity) continue;
        let suffix = 1;
        while (state.usedIds.has(collision)) collision = `${entry.id}:collision:${suffix++}`;
      }
      const resolvedEntry = { ...entry, id: collision };
      state.usedIds.add(collision);
      state.entryIdentities?.set(collision, identity);
      resolved.push(resolvedEntry);
      continue;
    }
    if (state.usedIds.has(entry.id)) {
      if (state.entryIdentities?.get(entry.id) === identity) continue;
      let collision = `${entry.id}:duplicate`;
      let suffix = 1;
      while (state.usedIds.has(collision)) collision = `${entry.id}:duplicate:${suffix++}`;
      const resolvedEntry = { ...entry, id: collision };
      state.usedIds.add(collision);
      state.entryIdentities?.set(collision, identity);
      resolved.push(resolvedEntry);
      continue;
    }
    state.usedIds.add(entry.id);
    state.entryIdentities?.set(entry.id, identity);
    resolved.push(entry);
    if (entry.eventId) state.eventOwners.set(entry.eventId, entry.cardId);
  }
  return resolved;
}

export function mergeReviewHistoryEntries(
  canonical: ReviewHistoryEntry[],
  cards: Card[],
): ReviewHistoryEntry[] {
  return resolveReviewHistoryCollisions([
    ...canonical,
    ...cards.flatMap(reviewHistoryEntriesForCard),
  ]);
}
