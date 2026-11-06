import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calculateRemainingWorkOffThread } from './remainingWorkWorker';
import type { RemainingWorkInput } from './remainingWorkData';
import { card } from '../fsrs/session.testFixtures';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
const input: RemainingWorkInput = {
  source: { course: null, lessons: [], cards: [], assessments: [], links: [] },
  plans: [],
};
beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

it('releases the worker when its final pending consumer aborts', async () => {
  const controller = new AbortController();
  const done = calculateRemainingWorkOffThread(input, 1, controller.signal);
  const settled = done.catch((error: unknown) => error);
  const worker = FakeWorker.instances[0];
  try {
    controller.abort();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(settled).resolves.toMatchObject({ name: 'AbortError' });
  } finally {
    worker.onerror!();
    await settled;
  }
});

it('keeps another consumer running when one shared request aborts', async () => {
  const controller = new AbortController();
  const first = calculateRemainingWorkOffThread(input, 1, controller.signal);
  const second = calculateRemainingWorkOffThread(input, 2);
  const settled = Promise.allSettled([first, second]);
  const rejected = vi.fn();
  void first.catch(rejected);
  const worker = FakeWorker.instances[0];
  try {
    controller.abort();
    await Promise.resolve();
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
    expect(worker.terminate).not.toHaveBeenCalled();
    const { id } = worker.postMessage.mock.calls[1][0];
    worker.onmessage!({ data: { id, results: [] } } as MessageEvent);
    expect((await settled).map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(worker.terminate).toHaveBeenCalledOnce();
  } finally {
    worker.onerror!();
    await settled;
  }
});

it('does not let a terminated worker error reject its replacement batch', async () => {
  const first = Promise.allSettled([calculateRemainingWorkOffThread(input, 1)]);
  const old = FakeWorker.instances[0];
  old.onerror!();
  await first;
  const second = calculateRemainingWorkOffThread(input, 2);
  const settled = Promise.allSettled([second]);
  const fresh = FakeWorker.instances[1];
  try {
    old.onerror!();
    expect(fresh.terminate).not.toHaveBeenCalled();
    fresh.onmessage!({
      data: { id: fresh.postMessage.mock.calls[0][0].id, results: [] },
    } as MessageEvent);
    expect((await settled)[0].status).toBe('fulfilled');
  } finally {
    fresh.onerror!();
    await settled;
  }
});

it('does not start work for an already aborted consumer', async () => {
  const controller = new AbortController();
  controller.abort();
  const settled = calculateRemainingWorkOffThread(input, 1, controller.signal).catch(
    (error: unknown) => error,
  );
  try {
    expect(FakeWorker.instances).toHaveLength(0);
    await expect(settled).resolves.toMatchObject({ name: 'AbortError' });
  } finally {
    FakeWorker.instances[0]?.onerror?.();
    await settled;
  }
});

it('sends only owning records and scheduling fields, without image bodies or Path activity', async () => {
  const source = {
    ...input.source,
    cards: [card('image', 'deck', { front: 'x'.repeat(128 * 1024), back: 'Heavy answer' })],
    activity: new Map([['image', [100, 200]]]),
  };
  const done = calculateRemainingWorkOffThread({ source, plans: [] }, 1);
  const worker = FakeWorker.instances[0];
  const [{ id, input: sent }] = worker.postMessage.mock.calls[0];
  expect(sent.source).not.toHaveProperty('activity');
  expect(sent.source.cards[0]).toMatchObject({ id: 'image', front: '', back: '' });
  expect(sent.source.cards[0].history).toEqual(source.cards[0].history);
  expect(source.cards[0].front).toHaveLength(128 * 1024);
  worker.onmessage!({ data: { id, results: [] } } as MessageEvent);
  await expect(done).resolves.toEqual([]);
});

it('routes concurrent course replies independently and releases the shared worker after the last reply', async () => {
  const firstDone = vi.fn();
  const first = calculateRemainingWorkOffThread(input, 1).then(firstDone);
  const second = calculateRemainingWorkOffThread(input, 2);
  expect(FakeWorker.instances).toHaveLength(1);
  const worker = FakeWorker.instances[0];
  const [firstMessage, secondMessage] = worker.postMessage.mock.calls.map(([message]) => message);
  worker.onmessage!({ data: { id: secondMessage.id, results: [] } } as MessageEvent);
  await expect(second).resolves.toEqual([]);
  expect(firstDone).not.toHaveBeenCalled();
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage!({ data: { id: firstMessage.id, results: [] } } as MessageEvent);
  await first;
  expect(firstDone).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it('rejects all pending courses on a worker failure and permits a fresh worker', async () => {
  const failures = Promise.allSettled([
    calculateRemainingWorkOffThread(input, 1),
    calculateRemainingWorkOffThread(input, 2),
  ]);
  const worker = FakeWorker.instances[0];
  worker.onerror!();
  expect((await failures).map((result) => result.status)).toEqual(['rejected', 'rejected']);
  expect(worker.terminate).toHaveBeenCalledOnce();
  const retry = calculateRemainingWorkOffThread(input, 3);
  expect(FakeWorker.instances).toHaveLength(2);
  const fresh = FakeWorker.instances[1];
  fresh.onmessage!({
    data: { id: fresh.postMessage.mock.calls[0][0].id, results: [] },
  } as MessageEvent);
  await expect(retry).resolves.toEqual([]);
  expect(fresh.terminate).toHaveBeenCalledOnce();
});
