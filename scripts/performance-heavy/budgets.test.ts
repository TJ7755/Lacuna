import { describe, expect, it } from 'vitest';
import { checkPerformanceReport, elapsedBudgetsMs } from './budgets';

function evidence() {
  return {
    completed: true,
    smoke: false,
    traced: false,
    mode: 'full',
    runs: [
      {
        rate: 1,
        counts: { cards: 10_000 },
        errors: [] as string[],
        samples: [
          ...Object.keys(elapsedBudgetsMs).map((name) => ({
            name,
            elapsedMs: 100,
            inputToReadableMs: 100,
            lag: { longTasks: [] as { duration: number }[] },
          })),
          ...['today', 'course', 'learn'].map((route) => ({
            name: `route-assets-${route}`,
            javascriptBytes: 900_000,
            cssBytes: 140_000,
          })),
        ],
      },
    ],
  };
}

describe('performance evidence gate', () => {
  it('accepts a complete full-size report below all ceilings', () => {
    expect(checkPerformanceReport(evidence())).toEqual([]);
  });
  it('rejects incomplete evidence even when recorded timings pass', () => {
    const report = evidence();
    report.completed = false;
    report.runs[0].samples = report.runs[0].samples.filter(
      (sample) => sample.name !== 'course-open',
    );
    expect(checkPerformanceReport(report)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('complete'),
        expect.stringContaining('Missing measurement: course-open'),
      ]),
    );
  });
  it('rejects slow interactions, long tasks and oversized route assets', () => {
    const report = evidence();
    const interaction = report.runs[0].samples.find((sample) => sample.name === 'course-open')!;
    if ('elapsedMs' in interaction) {
      interaction.elapsedMs = 10_000;
      interaction.inputToReadableMs = 900;
      interaction.lag.longTasks.push({ duration: 1_200 });
    }
    const route = report.runs[0].samples.find((sample) => sample.name === 'route-assets-learn')!;
    if ('javascriptBytes' in route) route.javascriptBytes = 2_000_000;
    expect(checkPerformanceReport(report)).toHaveLength(4);
  });
});
