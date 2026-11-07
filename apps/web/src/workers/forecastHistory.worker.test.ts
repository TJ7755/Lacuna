import { afterEach, expect, it, vi } from 'vitest';

const forecast = vi.hoisted(() => vi.fn());
vi.mock('../state/forecastHistoryData', () => ({ calculateForecastHistories: forecast }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  forecast.mockReset();
});

it.each([false, true])('responds to a forecast history request (failed: %s)', async (failed) => {
  if (failed) forecast.mockRejectedValue(new Error('Forecast failed'));
  else forecast.mockResolvedValue({ biology: [{ at: 1, recall: 0.5 }] });
  const endpoint: {
    onmessage?: (event: MessageEvent) => void;
    postMessage: ReturnType<typeof vi.fn>;
  } = { postMessage: vi.fn() };
  vi.stubGlobal('self', endpoint);
  await import('./forecastHistory.worker');
  const input = { courses: [], lessons: [], cards: [], forecasts: {}, from: 0, now: 1 };
  endpoint.onmessage!({ data: input } as MessageEvent);
  await vi.waitFor(() =>
    expect(endpoint.postMessage).toHaveBeenCalledWith(
      failed ? { error: 'Forecast failed' } : { histories: { biology: [{ at: 1, recall: 0.5 }] } },
    ),
  );
  expect(forecast).toHaveBeenCalledWith(input);
});
