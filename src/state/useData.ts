// Reactive data hooks backed by Dexie's live queries. Components re-render
// automatically when the underlying IndexedDB records change.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { hydrateCardsWithHistory, listAllReviewHistory } from '../db/reviewHistoryRead';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import type { BackupSnapshot, Card, SessionHistoryEntry } from '../db/types';

export function useCard(cardId: string | undefined): Card | null | undefined {
  return useLiveQuery<Card | null>(
    () =>
      cardId
        ? db.cards
            .get(cardId)
            .then(async (card) => (card ? (await hydrateCardsWithHistory([card]))[0] : null))
        : null,
    [cardId],
  );
}

/** Every card across all decks, for global search. */
export function useAllCards(): Card[] | undefined {
  return useLiveQuery(() => db.cards.toArray().then(hydrateCardsWithHistory), []);
}

/** All review events through the canonical event-store adapter. */
export function useAllReviewHistory(): ReviewHistoryEntry[] | undefined {
  return useLiveQuery(() => listAllReviewHistory(), []);
}

/** Automatic-backup restore points, newest first. */
export function useBackups(): BackupSnapshot[] | undefined {
  return useLiveQuery(() => db.backups.orderBy('createdAt').reverse().toArray(), []);
}

/** All session-history entries across every deck, sorted by timestamp. */
export function useAllSessionHistory(): SessionHistoryEntry[] | undefined {
  return useLiveQuery(() => db.sessionHistory.orderBy('timestamp').toArray(), []);
}
