import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard } from '../db/repository';
import { dashboardForecasts } from './dashboardForecasts';
import { calculateForecastHistories, type ForecastHistoryInput } from './forecastHistoryData';
import { calculateForecastHistoriesOffThread } from './forecastHistoryWorker';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failConstruction = false;
  static failPost = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn(() => {
    if (FakeWorker.failPost) throw new Error('Could not post');
  });
  terminate = vi.fn();
  constructor() {
    if (FakeWorker.failConstruction) throw new Error('Could not construct');
    FakeWorker.instances.push(this);
  }
}

let input: ForecastHistoryInput;
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  FakeWorker.instances = [];
  FakeWorker.failConstruction = FakeWorker.failPost = false;
  vi.stubGlobal('Worker', FakeWorker);
  const course = await createCourse('Biology');
  const card = await createCourseCard(course.id, 'front_back', 'Image body', 'Answer');
  const now = Date.now();
  input = {
    courses: [course],
    lessons: [],
    cards: [card],
    forecasts: dashboardForecasts([course], [], [card], now),
    from: now - 86400000,
    now,
  };
});
afterEach(() => vi.unstubAllGlobals());

it('returns worker points and terminates without reading histories on the renderer', async () => {
  const read = vi.spyOn(db.reviewHistory, 'toArray');
  const pending = calculateForecastHistoriesOffThread(input, new AbortController().signal);
  const worker = FakeWorker.instances[0];
  expect(worker.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'forecast-history',
      input: expect.objectContaining({ cards: [expect.objectContaining({ front: '', back: '' })] }),
    }),
  );
  worker.onmessage!({
    data: { histories: { biology: [{ at: input.now, recall: 0.5 }] } },
  } as MessageEvent);
  await expect(pending).resolves.toEqual({ biology: [{ at: input.now, recall: 0.5 }] });
  expect(read).not.toHaveBeenCalled();
  expect(worker.terminate).toHaveBeenCalledOnce();
  read.mockRestore();
});

it.each(['unavailable', 'construction', 'post', 'error', 'messageerror', 'reply'] as const)(
  'uses the real calculation when worker %s fails',
  async (failure) => {
    const expected = await calculateForecastHistories(input);
    if (failure === 'unavailable') vi.stubGlobal('Worker', undefined);
    FakeWorker.failConstruction = failure === 'construction';
    FakeWorker.failPost = failure === 'post';
    const pending = calculateForecastHistoriesOffThread(input, new AbortController().signal);
    const worker = FakeWorker.instances[0];
    if (failure === 'error') worker.onerror!();
    if (failure === 'messageerror') worker.onmessageerror!();
    if (failure === 'reply')
      worker.onmessage!({ data: { error: 'Failed calculation' } } as MessageEvent);
    await expect(pending).resolves.toEqual(expected);
    expect(Object.values(expected)[0]).toHaveLength(40);
    if (worker) expect(worker.terminate).toHaveBeenCalledOnce();
  },
);

it('cancels owned work without starting fallback or disturbing its replacement', async () => {
  const controller = new AbortController();
  const read = vi.spyOn(db.reviewHistory, 'toArray');
  const first = calculateForecastHistoriesOffThread(input, controller.signal).catch(
    (error: unknown) => error,
  );
  const old = FakeWorker.instances[0];
  controller.abort();
  await expect(first).resolves.toMatchObject({ name: 'AbortError' });
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(read).not.toHaveBeenCalled();
  const next = calculateForecastHistoriesOffThread(input, new AbortController().signal);
  const fresh = FakeWorker.instances[1];
  expect(old.onerror).toBeNull();
  fresh.onmessage!({ data: { histories: {} } } as MessageEvent);
  await expect(next).resolves.toEqual({});
  await expect(calculateForecastHistoriesOffThread(input, controller.signal)).rejects.toMatchObject(
    { name: 'AbortError' },
  );
  expect(FakeWorker.instances).toHaveLength(2);
  read.mockRestore();
});
