import { calculateRemainingWork, type RemainingWorkInput } from '../course/remainingWorkData';

let pendingCalculation = Promise.resolve();

self.onmessage = ({
  data,
}: MessageEvent<{ id: number; input: RemainingWorkInput; now: number }>) => {
  // Keep optional history reads from flooding IndexedDB while search is loading.
  pendingCalculation = pendingCalculation.then(async () => {
    try {
      const results = await calculateRemainingWork(data.input, data.now, true);
      self.postMessage({ id: data.id, results });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
