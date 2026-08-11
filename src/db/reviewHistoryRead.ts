import { db } from './schema';
import { mergeReviewHistoryEntries, type ReviewHistoryEntry } from './reviewHistory';
import type { Card } from './types';

/**
 * Hydrate cards from the canonical review-history store. Canonical rows take
 * precedence when the same event is present in both sources, while legacy-only
 * rows are retained so a partially dual-written card remains lossless.
 */
export async function hydrateCardsWithHistory(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const entries = await db.reviewHistory
    .where('cardId')
    .anyOf(cards.map((card) => card.id))
    .toArray();
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of entries) {
    const history = byCard.get(entry.cardId) ?? [];
    history.push(entry);
    byCard.set(entry.cardId, history);
  }

  return cards.map((card) => {
    const canonical = byCard.get(card.id) ?? [];
    const history = mergeReviewHistoryEntries(canonical, [card]);
    history.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    return { ...card, history };
  });
}
