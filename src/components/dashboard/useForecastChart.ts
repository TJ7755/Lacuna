import { useEffect, useState } from 'react';
import { claimRouteImportFailure } from '../../pwa/routeImportFailures';
import type { ForecastChart } from './ForecastChart';

type Chart = typeof ForecastChart;
let loaded: Chart | null = null;
let loading: Promise<Chart> | null = null;
let failedAttempts = 0;

// Keep these as separate callbacks: bundlers otherwise combine conditional import
// preload lists and fetch the recovery entry during the failing first attempt.
const chartLoaders = [() => import('./ForecastChart'), () => import('./ForecastChartRecovery')];

function loadForecastChart(): Promise<Chart> {
  // A rejected module URL can remain cached by the browser. The recovery entry has
  // its own URL; resetting React state against the original URL is not a retry.
  loading ??= chartLoaders[Math.min(failedAttempts, 1)]().then(
    (module) => (loaded = module.ForecastChart),
    (error: unknown) => {
      // Today owns this optional failure; preserve the queue instead of reloading the app.
      claimRouteImportFailure(error);
      loading = null;
      failedAttempts++;
      throw error;
    },
  );
  return loading;
}

export function useForecastChart(wanted: boolean) {
  const [Chart, setChart] = useState<Chart | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!wanted || Chart) return;
    let cancelled = false;
    loadForecastChart().then(
      (chart) => {
        if (!cancelled) setChart(() => chart);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, Chart, attempt]);
  return {
    Chart,
    failed,
    settled: Chart !== null || failed,
    reloadRequired: failedAttempts > 1,
    retry: () => {
      if (failedAttempts > 1) {
        window.location.reload();
        return;
      }
      setFailed(false);
      setAttempt((value) => value + 1);
    },
  };
}
