import { calculateRemainingWork, type RemainingWorkInput } from '../course/remainingWorkData';
import {
  calculateForecastHistories,
  type ForecastHistoryInput,
} from '../state/forecastHistoryData';

let pendingCalculation = Promise.resolve();

self.onmessage = ({
  data,
}: MessageEvent<
  | { kind: 'forecast-history'; input: ForecastHistoryInput }
  | { kind?: undefined; id: number; input: RemainingWorkInput; now: number }
>) => {
  if (data.kind === 'forecast-history') {
    // Today's bridge owns a separate named instance of this packaged entry.
    void calculateForecastHistories(data.input).then(
      (histories) => self.postMessage({ histories }),
      (error: unknown) =>
        self.postMessage({ error: error instanceof Error ? error.message : String(error) }),
    );
    return;
  }
  // Keep optional history reads from flooding IndexedDB while search is loading.
  pendingCalculation = pendingCalculation.then(async () => {
    try {
      const results = await calculateRemainingWork(data.input, data.now, true);
      self.postMessage({ id: data.id, results });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
