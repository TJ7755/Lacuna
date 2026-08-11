import type { Card, ReviewLog } from './types';

/**
 * A review event in the canonical append-only history store. The card keeps its
 * legacy `history` projection until the read/write cutover is complete.
 */
export interface ReviewHistoryEntry extends ReviewLog {
  /** Stable store primary key. Event-backed rows use the event id directly. */
  id: string;
  cardId: string;
  deckId: string;
  courseId?: string | null;
  primaryLessonId?: string | null;
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
    };
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
  entryIdentities: Set<string>;
}

function reviewHistoryEntryIdentity(entry: ReviewHistoryEntry): string {
  const { id: _id, ...identity } = entry;
  return JSON.stringify(identity);
}

export function resolveReviewHistoryCollisions(
  entries: ReviewHistoryEntry[],
  state: ReviewHistoryCollisionState = {
    usedIds: new Set(),
    eventOwners: new Map(),
    entryIdentities: new Set(),
  },
): ReviewHistoryEntry[] {
  const resolved: ReviewHistoryEntry[] = [];
  for (const entry of entries) {
    const identity = reviewHistoryEntryIdentity(entry);
    if (state.entryIdentities.has(identity)) continue;
    const owner = entry.eventId ? state.eventOwners.get(entry.eventId) : undefined;
    if (owner && owner !== entry.cardId) {
      let collision = `${entry.id}:card:${encodeURIComponent(entry.cardId)}`;
      let suffix = 1;
      while (state.usedIds.has(collision)) collision = `${entry.id}:collision:${suffix++}`;
      const resolvedEntry = { ...entry, id: collision };
      state.usedIds.add(collision);
      state.entryIdentities.add(identity);
      resolved.push(resolvedEntry);
      continue;
    }
    if (state.usedIds.has(entry.id)) {
      let collision = `${entry.id}:duplicate`;
      let suffix = 1;
      while (state.usedIds.has(collision)) collision = `${entry.id}:duplicate:${suffix++}`;
      const resolvedEntry = { ...entry, id: collision };
      state.usedIds.add(collision);
      state.entryIdentities.add(identity);
      resolved.push(resolvedEntry);
      continue;
    }
    state.usedIds.add(entry.id);
    state.entryIdentities.add(identity);
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
