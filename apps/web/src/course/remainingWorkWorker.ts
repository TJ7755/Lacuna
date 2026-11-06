import {
  calculateRemainingWork,
  type RemainingWorkInput,
  type RemainingWorkResults,
} from './remainingWorkData';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (results: RemainingWorkResults) => void;
    reject: (error: Error) => void;
    cleanup(): void;
  }
>();

function releaseWorkerIfIdle(): void {
  if (pending.size) return;
  const idle = worker;
  worker = undefined;
  idle?.terminate();
}

/** Share one worker across Today rows, and release it when the current batch finishes. */
export function calculateRemainingWorkOffThread(
  input: RemainingWorkInput,
  now: number,
  signal?: AbortSignal,
): Promise<RemainingWorkResults> {
  if (signal?.aborted)
    return Promise.reject(new DOMException('Assessment workload cancelled.', 'AbortError'));
  if (typeof Worker === 'undefined') return calculateRemainingWork(input, now, true);
  if (!worker) {
    const active = new Worker(new URL('../workers/remainingWork.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker = active;
    active.onmessage = ({
      data,
    }: MessageEvent<{ id: number; results: RemainingWorkResults; error?: string }>) => {
      if (worker !== active) return;
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      request.cleanup();
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.results);
      releaseWorkerIfIdle();
    };
    active.onerror = () => {
      if (worker !== active) return;
      for (const request of pending.values()) {
        request.cleanup();
        request.reject(new Error('Assessment workload calculation failed.'));
      }
      pending.clear();
      releaseWorkerIfIdle();
    };
  }
  const active = worker;
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const abort = () => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.cleanup();
      reject(new DOMException('Assessment workload cancelled.', 'AbortError'));
      releaseWorkerIfIdle();
    };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    pending.set(id, { resolve, reject, cleanup });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      const { course, assessments, lessons, cards, links, concepts } = input.source;
      // Path records also contain activity and planning data. Estimates only need
      // ownership, schedules and real legacy evidence; never clone image bodies.
      const source = {
        course,
        assessments,
        lessons,
        links,
        concepts,
        cards: cards.map(({ front: _front, back: _back, payload: _payload, ...card }) => ({
          ...card,
          front: '',
          back: '',
        })),
      };
      active.postMessage({ id, input: { source, plans: input.plans }, now });
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(error);
      releaseWorkerIfIdle();
    }
  });
}
