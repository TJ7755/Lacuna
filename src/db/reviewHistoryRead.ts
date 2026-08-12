import { db } from './schema';
import {
  resolveReviewHistoryCollisions,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import type { Card } from './types';

function sortReviewHistory(entries: ReviewHistoryEntry[]): ReviewHistoryEntry[] {
  return entries.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/**
 * Merge canonical rows with card projections for reads. A canonical event row
 * suppresses only the matching projection for the same card/event; distinct
 * duplicate canonical rows remain available to portability and diagnostics.
 */
function mergeReviewHistoryForRead(
  canonical: ReviewHistoryEntry[],
  cards: Card[],
): ReviewHistoryEntry[] {
  const canonicalEvents = new Set(
    canonical
      .filter((entry) => entry.eventId)
      .map((entry) => `${entry.cardId}\u0000${entry.eventId}`),
  );
  const projections = cards
    .flatMap(reviewHistoryEntriesForCard)
    .filter(
      (entry) =>
        !entry.eventId || !canonicalEvents.has(`${entry.cardId}\u0000${entry.eventId}`),
    );
  return resolveReviewHistoryCollisions([...canonical, ...projections]);
}

/**
 * Read canonical events for a card set, retaining legacy-only projection rows
 * until every supported import path has passed the compatibility window.
 */
export async function listReviewHistoryForCards(cards: Card[]): Promise<ReviewHistoryEntry[]> {
  if (cards.length === 0) return [];
  const canonical = await db.reviewHistory
    .where('cardId')
    .anyOf(cards.map((card) => card.id))
    .toArray();
  return sortReviewHistory(mergeReviewHistoryForRead(canonical, cards));
}

/** Read all review events through the canonical adapter, with a legacy fallback. */
export async function listAllReviewHistory(): Promise<ReviewHistoryEntry[]> {
  const [canonical, cards] = await Promise.all([db.reviewHistory.toArray(), db.cards.toArray()]);
  return sortReviewHistory(mergeReviewHistoryForRead(canonical, cards));
}

/** Read one course's review events through the canonical adapter. */
export async function listReviewHistoryForCourse(courseId: string): Promise<ReviewHistoryEntry[]> {
  const [canonical, cards] = await Promise.all([
    db.reviewHistory.where('courseId').equals(courseId).toArray(),
    db.cards.where('courseId').equals(courseId).toArray(),
  ]);
  return sortReviewHistory(mergeReviewHistoryForRead(canonical, cards));
}

/**
 * Hydrate cards from the canonical review-history store. Canonical rows take
 * precedence when the same event is present in both sources, while legacy-only
 * rows are retained so a partially dual-written card remains lossless.
 */
export async function hydrateCardsWithHistory(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const entries = await listReviewHistoryForCards(cards);
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of entries) {
    const history = byCard.get(entry.cardId) ?? [];
    history.push(entry);
    byCard.set(entry.cardId, history);
  }

  return cards.map((card) => {
    const canonical = byCard.get(card.id) ?? [];
    return { ...card, history: canonical };
  });
}
