import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calculateRemainingWorkOffThread } from './remainingWorkWorker';
import type { RemainingWorkInput } from './remainingWorkData';

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
