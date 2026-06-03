// Reactive data hooks backed by Dexie's live queries. Components re-render
// automatically when the underlying IndexedDB records change.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Card, Deck, SessionHistoryEntry, UserPerformance } from '../db/types';
import { progressValue } from '../fsrs/objective';

export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
}

export function useDeck(deckId: string | undefined): Deck | undefined {
  return useLiveQuery(
    () => (deckId ? db.decks.get(deckId) : undefined),
    [deckId],
  );
}

export function useCards(deckId: string | undefined): Card[] | undefined {
  return useLiveQuery(
    () => (deckId ? db.cards.where('deckId').equals(deckId).toArray() : []),
    [deckId],
  );
}

export function useDeckPerformance(
  deckId: string | undefined,
): UserPerformance | undefined {
  return useLiveQuery(
    () => (deckId ? db.userPerformance.get(deckId) : undefined),
    [deckId],
  );
}

export function useSessionHistory(
  deckId: string | undefined,
): SessionHistoryEntry[] | undefined {
  return useLiveQuery(
    () =>
      deckId
        ? db.sessionHistory.where('deckId').equals(deckId).sortBy('timestamp')
        : [],
    [deckId],
  );
}

export interface DeckSummary {
  count: number;
  /** Objective-aware progress (0..1): mean predicted R, or fraction secured. */
  mastery: number;
  /** Number of cards that have never been reviewed. */
  unreviewed: number;
}

/**
 * Per-deck summary statistics for the dashboard: card count, mastery fraction and
 * how many cards remain unreviewed. Recomputed reactively as cards or decks change.
 */
export function useDeckSummaries(): Record<string, DeckSummary> | undefined {
  return useLiveQuery(async () => {
    const [decks, cards] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
    ]);
    const deckById = new Map(decks.map((d) => [d.id, d]));
    const byDeck: Record<string, Card[]> = {};
    for (const card of cards) (byDeck[card.deckId] ??= []).push(card);

    const summaries: Record<string, DeckSummary> = {};
    for (const deck of decks) {
      const deckCards = byDeck[deck.id] ?? [];
      summaries[deck.id] = {
        count: deckCards.length,
        mastery: progressValue(deckCards, deck),
        unreviewed: deckCards.filter((c) => c.lastReviewed === null).length,
      };
    }
    // Account for any orphaned card sets whose deck was removed mid-transaction.
    for (const [deckId, deckCards] of Object.entries(byDeck)) {
      if (!deckById.has(deckId)) continue;
      summaries[deckId] ??= {
        count: deckCards.length,
        mastery: 0,
        unreviewed: deckCards.length,
      };
    }
    return summaries;
  }, []);
}
