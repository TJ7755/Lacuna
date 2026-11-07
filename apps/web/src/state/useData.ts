// Reactive data hooks backed by Dexie's live queries. Components re-render
// automatically when the underlying IndexedDB records change.

import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ForecastHistories, ForecastHistoryInput } from './forecastHistoryData';
import { calculateForecastHistoriesOffThread } from './forecastHistoryWorker';
import { db } from '../db/schema';
import { hydrateCardsWithHistory, listAllReviewHistory } from '../db/reviewHistoryRead';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type { BackupSnapshot, Card, SessionHistoryEntry } from '@lacuna/core/db/types';
import { listGlobalDailySessionHistory } from '../db/sessionHistoryRead';

/** Navigation preparation and Quick search pause optional calculations. */
export const BackgroundCalculationsEnabled = createContext(true);
const FORECAST_RESUME_DELAY_MS = 500;

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

export function useDashboardForecastHistories(
  data:
    | (Pick<ForecastHistoryInput, 'courses' | 'lessons' | 'forecasts'> & { allCards: Card[] })
    | undefined,
  past: number,
): ForecastHistories | undefined {
  const enabled = useContext(BackgroundCalculationsEnabled);
  const revision = useLiveQuery(async () => {
    if (!enabled) return undefined;
    // A full primary-key range observes edits as well as inserts/deletes. Return
    // a new token even when count is unchanged (e.g. corrected historical evidence).
    await db.reviewHistory.count();
    return {};
  }, [enabled]);
  const [histories, setHistories] = useState<ForecastHistories>();
  const [error, setError] = useState<unknown>();
  const wasPaused = useRef(false);
  useEffect(() => {
    if (!enabled) {
      wasPaused.current = true;
      return;
    }
    if (!data || !revision) return;
    const controller = new AbortController();
    const { signal } = controller;
    const start = () => {
      wasPaused.current = false;
      const now = Date.now();
      void Promise.resolve()
        .then(() => {
          if (signal.aborted) return undefined;
          if (Object.keys(data.forecasts).length === 0) return {};
          return calculateForecastHistoriesOffThread(
            {
              courses: data.courses,
              lessons: data.lessons,
              cards: data.allCards,
              forecasts: data.forecasts,
              from: now - past * 86_400_000,
              now,
            },
            signal,
          );
        })
        .then(
          (next) => {
            if (!signal.aborted) setHistories(next);
          },
          (cause: unknown) => {
            if (!signal.aborted) setError(cause);
          },
        );
    };
    // Closing Quick search can be followed immediately by navigation. A worker
    // terminated after a bulk read starts can still leave IndexedDB busy.
    const resume = wasPaused.current ? setTimeout(start, FORECAST_RESUME_DELAY_MS) : undefined;
    if (resume === undefined) start();
    return () => {
      clearTimeout(resume);
      controller.abort();
    };
  }, [data, past, revision, enabled]);
  if (error) throw error;
  // Keep the last complete trace visible while a changed snapshot is calculated.
  return data ? histories : undefined;
}

/** Automatic-backup restore points, newest first. */
export function useBackups(): BackupSnapshot[] | undefined {
  return useLiveQuery(() => db.backups.orderBy('createdAt').reverse().toArray(), []);
}

/** Daily per-Course trajectory points across active analytics history. */
export function useAllSessionHistory(): SessionHistoryEntry[] | undefined {
  return useLiveQuery(() => listGlobalDailySessionHistory(), []);
}
