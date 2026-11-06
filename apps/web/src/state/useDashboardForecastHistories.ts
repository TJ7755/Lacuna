import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Card } from '@lacuna/core/db/types';
import type { ForecastHistories, ForecastHistoryInput } from './forecastHistoryData';
import { calculateForecastHistoriesOffThread } from './forecastHistoryWorker';

export function useDashboardForecastHistories(
  data:
    | (Pick<ForecastHistoryInput, 'courses' | 'lessons' | 'forecasts'> & { allCards: Card[] })
    | undefined,
  past: number,
): ForecastHistories | undefined {
  const revision = useLiveQuery(async () => {
    // A full primary-key range observes edits as well as inserts/deletes. Return
    // a new token even when count is unchanged (e.g. corrected historical evidence).
    await db.reviewHistory.count();
    return {};
  }, []);
  const [histories, setHistories] = useState<ForecastHistories>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!data || !revision) return;
    const controller = new AbortController();
    const { signal } = controller;
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
    return () => controller.abort();
  }, [data, past, revision]);
  if (error) throw error;
  // Keep the last complete trace visible while a changed snapshot is calculated.
  return data ? histories : undefined;
}
