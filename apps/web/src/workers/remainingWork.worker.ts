import { calculateRemainingWork, type RemainingWorkInput } from '../course/remainingWorkData';

self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; input: RemainingWorkInput; now: number }>) => {
  try {
    const results = await calculateRemainingWork(data.input, data.now, true);
    self.postMessage({ id: data.id, results });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
