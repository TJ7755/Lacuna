import type { MemorySeriesSummary } from './memory-types';

export const MEMORY_SAMPLES_PER_CHECKPOINT = 9;
export const MEMORY_SAMPLE_INTERVAL_MS = 250;

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

export function summariseMemorySeries(values: readonly number[]): MemorySeriesSummary {
  if (values.length !== MEMORY_SAMPLES_PER_CHECKPOINT) {
    throw new Error(
      `A memory checkpoint requires exactly ${MEMORY_SAMPLES_PER_CHECKPOINT} samples; received ${values.length}.`,
    );
  }
  const centre = median(values);
  return {
    count: values.length,
    median: centre,
    medianAbsoluteDeviation: median(values.map((value) => Math.abs(value - centre))),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}
