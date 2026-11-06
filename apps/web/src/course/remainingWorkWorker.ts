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
  }
>();

/** Share one worker across Today rows, and release it when the current batch finishes. */
export function calculateRemainingWorkOffThread(
  input: RemainingWorkInput,
  now: number,
): Promise<RemainingWorkResults> {
  if (typeof Worker === 'undefined') return calculateRemainingWork(input, now, true);
  if (!worker) {
    worker = new Worker(new URL('../workers/remainingWork.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; results: RemainingWorkResults; error?: string }>) => {
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) request?.reject(new Error(data.error));
      else request?.resolve(data.results);
      if (!pending.size) {
        worker?.terminate();
        worker = undefined;
      }
    };
    worker.onerror = () => {
      for (const request of pending.values())
        request.reject(new Error('Assessment workload calculation failed.'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
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
      worker!.postMessage({ id, input: { source, plans: input.plans }, now });
    } catch (error) {
      pending.delete(id);
      reject(error);
      if (!pending.size) {
        worker?.terminate();
        worker = undefined;
      }
    }
  });
}
