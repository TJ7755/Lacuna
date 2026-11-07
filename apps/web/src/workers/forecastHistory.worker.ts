import {
  calculateForecastHistories,
  type ForecastHistoryInput,
} from '../state/forecastHistoryData';

self.onmessage = ({ data }: MessageEvent<ForecastHistoryInput>) => {
  void calculateForecastHistories(data).then(
    (histories) => self.postMessage({ histories }),
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }),
  );
};
