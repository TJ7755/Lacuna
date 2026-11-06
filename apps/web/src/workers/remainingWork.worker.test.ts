import { afterEach, expect, it, vi } from 'vitest';
import type { RemainingWorkInput, RemainingWorkResults } from '../course/remainingWorkData';

const calculate = vi.hoisted(() => vi.fn());
const forecast = vi.hoisted(() => vi.fn());
vi.mock('../course/remainingWorkData', () => ({ calculateRemainingWork: calculate }));
vi.mock('../state/forecastHistoryData', () => ({ calculateForecastHistories: forecast }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  calculate.mockReset();
  forecast.mockReset();
});

it.each([false, true])(
  'dispatches an independently owned forecast request (failed: %s)',
  async (failed) => {
    if (failed) forecast.mockRejectedValue(new Error('Forecast failed'));
    else forecast.mockResolvedValue({ biology: [{ at: 1, recall: 0.5 }] });
    const endpoint: {
      onmessage?: (event: MessageEvent) => void;
      postMessage: ReturnType<typeof vi.fn>;
    } = { postMessage: vi.fn() };
    vi.stubGlobal('self', endpoint);
    await import('./remainingWork.worker');
    const input = { courses: [], lessons: [], cards: [], forecasts: {}, from: 0, now: 1 };
    endpoint.onmessage!({ data: { kind: 'forecast-history', input } } as MessageEvent);
    await vi.waitFor(() =>
      expect(endpoint.postMessage).toHaveBeenCalledWith(
        failed
          ? { error: 'Forecast failed' }
          : { histories: { biology: [{ at: 1, recall: 0.5 }] } },
      ),
    );
    expect(forecast).toHaveBeenCalledWith(input);
    expect(calculate).not.toHaveBeenCalled();
  },
);

it('finishes one course read before starting another, including after a failed read', async () => {
  const completions: {
    resolve: (result: RemainingWorkResults) => void;
    reject: (error: Error) => void;
  }[] = [];
  calculate.mockImplementation(
    () =>
      new Promise<RemainingWorkResults>((resolve, reject) => {
        completions.push({ resolve, reject });
      }),
  );
  const endpoint: {
    onmessage?: (event: MessageEvent) => void;
    postMessage: ReturnType<typeof vi.fn>;
  } = { postMessage: vi.fn() };
  vi.stubGlobal('self', endpoint);
  await import('./remainingWork.worker');
  const input: RemainingWorkInput = {
    source: { course: null, lessons: [], cards: [], assessments: [], links: [] },
    plans: [],
  };
  endpoint.onmessage!({ data: { id: 1, input, now: 1 } } as MessageEvent);
  endpoint.onmessage!({ data: { id: 2, input, now: 1 } } as MessageEvent);
  await vi.waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
  completions[0].reject(new Error('Read failed'));
  await vi.waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));
  expect(endpoint.postMessage).toHaveBeenCalledWith({ id: 1, error: 'Read failed' });
  completions[1].resolve([]);
  await vi.waitFor(() => expect(endpoint.postMessage).toHaveBeenCalledWith({ id: 2, results: [] }));
});
