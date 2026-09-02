import type { MemorySeriesSummary, PackagedMemoryReport } from './memory-types';

interface MemoryDelta {
  before: number;
  after: number;
  absoluteChange: number;
  percentageChange: number | null;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function assertCompatible(before: PackagedMemoryReport, after: PackagedMemoryReport): void {
  const checks: [string, unknown, unknown][] = [
    ['schema', before.schemaVersion, after.schemaVersion],
    ['host', before.host, after.host],
    ['runtime', before.runtime, after.runtime],
    ['fixture', before.fixture, after.fixture],
    ['sample policy', before.samplePolicy, after.samplePolicy],
    [
      'checkpoint schema',
      before.checkpoints.map((entry) => [entry.checkpoint, Object.keys(entry.totals).sort()]),
      after.checkpoints.map((entry) => [entry.checkpoint, Object.keys(entry.totals).sort()]),
    ],
  ];
  const mismatch = checks.find(([, left, right]) => stable(left) !== stable(right));
  if (mismatch) {
    throw new Error(`Memory reports are incompatible: ${mismatch[0]} differs.`);
  }
}

function delta(
  before: MemorySeriesSummary | undefined,
  after: MemorySeriesSummary | undefined,
): MemoryDelta | undefined {
  if (!before || !after) return undefined;
  const absoluteChange = after.median - before.median;
  return {
    before: before.median,
    after: after.median,
    absoluteChange,
    percentageChange: before.median === 0 ? null : (absoluteChange / before.median) * 100,
  };
}

export function compareMemoryReports(before: PackagedMemoryReport, after: PackagedMemoryReport) {
  assertCompatible(before, after);
  return {
    before: before.executable,
    after: after.executable,
    checkpoints: before.checkpoints.map((beforeCheckpoint, index) => {
      const afterCheckpoint = after.checkpoints[index]!;
      return {
        checkpoint: beforeCheckpoint.checkpoint,
        sumOfWorkingSetsBytes: delta(
          beforeCheckpoint.totals.sumOfWorkingSetsBytes,
          afterCheckpoint.totals.sumOfWorkingSetsBytes,
        )!,
        ...(beforeCheckpoint.totals.privateBytes && afterCheckpoint.totals.privateBytes
          ? {
              privateBytes: delta(
                beforeCheckpoint.totals.privateBytes,
                afterCheckpoint.totals.privateBytes,
              )!,
            }
          : {}),
        rendererHeapUsedBytes: delta(
          beforeCheckpoint.totals.rendererHeapUsedBytes,
          afterCheckpoint.totals.rendererHeapUsedBytes,
        )!,
      };
    }),
  };
}
