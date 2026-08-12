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
 * Merge canonical rows with card projections for compatibility reads. A canonical
 * event row suppresses only the matching projection for the same card/event;
 * legacy-only projection rows remain visible until the compatibility window closes.
 */
function mergeReviewHistoryForRead(
  canonical: readonly ReviewHistoryEntry[],
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

/** Resolve an explicitly supplied canonical result without consulting projections. */
function resolveExplicitReviewHistory(entries: readonly ReviewHistoryEntry[]): ReviewHistoryEntry[] {
  return resolveReviewHistoryCollisions([...entries]);
}

/**
 * Read review events for a card set. When `reviewHistory` is omitted, the adapter
 * retains legacy-only projection rows for compatibility. When it is supplied,
 * including as an explicit empty array, that canonical result is authoritative.
 */
export async function listReviewHistoryForCards(
  cards: Card[],
  reviewHistory?: readonly ReviewHistoryEntry[],
): Promise<ReviewHistoryEntry[]> {
  if (cards.length === 0) return [];
  const canonical =
    reviewHistory ??
    (await db.reviewHistory.where('cardId').anyOf(cards.map((card) => card.id)).toArray());
  const entries =
    reviewHistory === undefined
      ? mergeReviewHistoryForRead(canonical, cards)
      : resolveExplicitReviewHistory(
          canonical.filter((entry) => cards.some((card) => card.id === entry.cardId)),
        );
  return sortReviewHistory(entries);
}

/** Read all review events through the canonical adapter, with legacy compatibility fallback. */
export async function listAllReviewHistory(): Promise<ReviewHistoryEntry[]> {
  const canonical = await db.reviewHistory.toArray();
  return sortReviewHistory(mergeReviewHistoryForRead(canonical, await db.cards.toArray()));
}

/** Read one course's review events through the canonical adapter. */
export async function listReviewHistoryForCourse(courseId: string): Promise<ReviewHistoryEntry[]> {
  const [canonical, cards] = await Promise.all([
    db.reviewHistory.where('courseId').equals(courseId).toArray(),
    db.cards.where('courseId').equals(courseId).toArray(),
  ]);
  return sortReviewHistory(mergeReviewHistoryForRead(canonical, cards));
}

/** Hydrate cards from review history. An explicitly supplied empty canonical result clears history. */
export async function hydrateCardsWithHistory(
  cards: Card[],
  reviewHistory?: readonly ReviewHistoryEntry[],
): Promise<Card[]> {
  if (cards.length === 0) return [];
  const entries = await listReviewHistoryForCards(cards, reviewHistory);
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of entries) {
    const history = byCard.get(entry.cardId) ?? [];
    history.push(entry);
    byCard.set(entry.cardId, history);
  }

  return cards.map((card) => ({ ...card, history: byCard.get(card.id) ?? [] }));
}
