import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharePayload } from './share';

type WorkerMessage = {
  type: 'decode';
  code: string;
  id: number;
};
type WorkerListener = (event: MessageEvent) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly terminate = vi.fn();
  private readonly listeners = new Set<WorkerListener>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.add(listener as WorkerListener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.listeners.delete(listener as WorkerListener);
  }

  postMessage(message: WorkerMessage): void {
    void (async () => {
      const share = await import('./share');
      const result = await share.decodeShareDirect(message.code);
      const event = { data: { type: 'result', result, id: message.id } } as MessageEvent;
      for (const listener of this.listeners) listener(event);
    })();
  }
}

describe('share worker lifecycle', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('terminates the worker after the last concurrent job succeeds', async () => {
    const share = await import('./share');
    const payload: SharePayload = {
      v: 2,
      at: 1,
      course: { n: 'Shared', o: 0, c: 0, e: 0, um: 'open' },
      lessons: [{ n: 'Lesson', notes: [], cards: [] }],
    };
    const code = await share.encodeShareDirect(payload);

    const [first, second] = await Promise.all([share.decodeShare(code), share.decodeShare(code)]);

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});
