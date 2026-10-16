import { useEffect, useState } from 'react';
import type { ForecastChart } from './ForecastChart';

type Chart = typeof ForecastChart;

// Kept for the session once fetched, so a return to Today renders the chart in its first frame.
let loaded: Chart | null = null;
let loading: Promise<Chart> | null = null;

function loadForecastChart(): Promise<Chart> {
  loading ??= import('./ForecastChart').then(
    (module) => (loaded = module.ForecastChart),
    (error: unknown) => {
      // A failed chunk retries on the next visit rather than staying broken.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * The forecast chart, loaded on demand so it stays out of the first-load bundle. `settled`
 * turns true once the chart is ready or has failed to load, so callers can wait on it
 * without waiting forever; a failed load leaves `Chart` null.
 */
export function useForecastChart(wanted: boolean): { Chart: Chart | null; settled: boolean } {
  const [state, setState] = useState<{ Chart: Chart | null; failed: boolean }>(() => ({
    Chart: loaded,
    failed: false,
  }));

  useEffect(() => {
    if (!wanted || state.Chart || state.failed) return;
    let cancelled = false;
    loadForecastChart().then(
      (Chart) => {
        if (!cancelled) setState({ Chart, failed: false });
      },
      () => {
        if (!cancelled) setState({ Chart: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, state.Chart, state.failed]);

  return { Chart: state.Chart, settled: state.Chart !== null || state.failed };
}
