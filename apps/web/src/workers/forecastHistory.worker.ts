import {
  calculateForecastHistories,
  type ForecastHistoryInput,
} from '../state/forecastHistoryData';

self.onmessage = async ({ data }: MessageEvent<ForecastHistoryInput>) => {
  try {
    self.postMessage({ histories: await calculateForecastHistories(data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
