import {
  calculateForecastHistories,
  type ForecastHistories,
  type ForecastHistoryInput,
} from './forecastHistoryData';

/** Reuse the shell's card snapshot without cloning image bodies into the worker. */
export function forecastHistorySnapshot(input: ForecastHistoryInput): ForecastHistoryInput {
  return {
    ...input,
    cards: input.cards.map(({ front: _front, back: _back, payload: _payload, ...card }) => ({
      ...card,
      front: '',
      back: '',
    })),
  };
}

/** One Today calculation owns its worker, so leaving or replacing it releases all work. */
export async function calculateForecastHistoriesOffThread(
  input: ForecastHistoryInput,
  signal: AbortSignal,
): Promise<ForecastHistories> {
  const cancelled = () => new DOMException('Forecast history cancelled.', 'AbortError');
  if (signal.aborted) throw cancelled();
  try {
    if (typeof Worker === 'undefined') throw new Error('Workers unavailable.');
    const worker = new Worker(new URL('../workers/forecastHistory.worker.ts', import.meta.url), {
      type: 'module',
      name: 'forecast-history',
    });
    return await new Promise<ForecastHistories>((resolve, reject) => {
      const finish = (error?: Error, histories?: ForecastHistories) => {
        signal.removeEventListener('abort', abort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        if (error) reject(error);
        else resolve(histories!);
      };
      const abort = () => finish(cancelled());
      worker.onmessage = ({
        data,
      }: MessageEvent<{ histories: ForecastHistories; error?: string }>) => {
        if (data.error) finish(new Error(data.error));
        else finish(undefined, data.histories);
      };
      worker.onerror = worker.onmessageerror = () =>
        finish(new Error('Forecast history calculation failed.'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) return abort();
      try {
        worker.postMessage(forecastHistorySnapshot(input));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  } catch (error) {
    if (signal.aborted) throw error;
    // Cached Today can open offline before its optional worker chunk is available.
    // Use the same real adapter and calculation if loading or messaging fails.
    return calculateForecastHistories(input);
  }
}
