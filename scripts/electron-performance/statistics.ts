export interface DistributionSummary {
  count: number;
  median: number;
  medianAbsoluteDeviation: number;
  minimum: number;
  maximum: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('Cannot calculate a median for an empty sample.');
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

export function summariseDistribution(values: readonly number[]): DistributionSummary {
  const centre = median(values);
  return {
    count: values.length,
    median: centre,
    medianAbsoluteDeviation: median(values.map((value) => Math.abs(value - centre))),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}
