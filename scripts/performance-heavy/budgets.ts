// Route baselines: GitHub Ubuntu run 41317899236, initial-only accounting on relay v2.
export const routeAssetBudgets: Record<string, { javascriptBytes: number; cssBytes: number }> = {
  'route-assets-today': { javascriptBytes: 1_670_000, cssBytes: 155_000 },
  'route-assets-course': { javascriptBytes: 1_530_000, cssBytes: 174_000 },
  'route-assets-learn': { javascriptBytes: 3_200_000, cssBytes: 196_000 },
};

/** Initial timing ceilings; compare retained reports before tightening them. */
export const elapsedBudgetsMs: Record<string, number> = {
  'dashboard-load': 8_000,
  'global-search': 2_000,
  'course-open': 3_000,
  'cards-open': 3_000,
  'cards-search': 2_000,
  'study-open': 8_000,
  'answer-reveal': 1_500,
  'review-next-card': 2_000,
  'burst-answer-reveal': 1_500,
  'burst-review-next-card': 2_000,
  'backup-export': 60_000,
  'backup-preview': 60_000,
  'backup-replace': 120_000,
};

// GitHub Ubuntu run 41317378155 observed 1,397 ms for the cold Today-to-course
// interaction; full run 41317388148 observed 493–688 ms. Keep other inputs strict.
export const inputBudgetsMs: Record<string, number> = { 'course-open': 1_500 };

interface Sample {
  name: string;
  elapsedMs?: number;
  failed?: boolean;
  inputToReadableMs?: number;
  javascriptBytes?: number;
  cssBytes?: number;
  lag?: { longTasks: { duration: number }[] };
}
interface Report {
  completed?: boolean;
  smoke?: boolean;
  traced?: boolean;
  mode?: string;
  runs?: { rate: number; counts: { cards: number }; errors: string[]; samples: Sample[] }[];
}

export function checkPerformanceReport(value: unknown): string[] {
  const report = value as Report;
  const failures: string[] = [];
  if (!report.completed || report.smoke || report.traced)
    failures.push('Budget evidence must be complete, untraced and use the full fixture.');
  if (!report.runs?.length) return [...failures, 'No performance runs recorded.'];
  const required = Object.keys(elapsedBudgetsMs).filter(
    (name) =>
      (!name.startsWith('backup-') || report.mode !== 'quick') && !name.startsWith('burst-'),
  );
  for (const run of report.runs) {
    if (run.rate !== 1 || run.counts.cards !== 10_000 || run.errors.length)
      failures.push('Budget runs require 1x CPU, 10,000 cards and no runtime errors.');
    for (const name of [
      ...required,
      'route-assets-today',
      'route-assets-course',
      'route-assets-learn',
    ]) {
      if (!run.samples.some((sample) => sample.name === name))
        failures.push(`Missing measurement: ${name}`);
    }
    for (const sample of run.samples) {
      if (sample.failed) failures.push(`${sample.name}: action failed`);
      const ceiling = elapsedBudgetsMs[sample.name];
      if (ceiling !== undefined) {
        if (
          !Number.isFinite(sample.elapsedMs) ||
          sample.elapsedMs! < 0 ||
          sample.elapsedMs! > ceiling
        )
          failures.push(`${sample.name}: ${sample.elapsedMs} ms exceeds ${ceiling} ms`);
        if (!sample.lag) failures.push(`${sample.name}: long-task evidence is missing`);
        // Backup serialisation has a separate task ceiling; interactive routes must stay responsive.
        const longest = Math.max(0, ...(sample.lag?.longTasks ?? []).map((task) => task.duration));
        const taskCeiling = sample.name.startsWith('backup-') ? 10_000 : 1_000;
        if (longest > taskCeiling)
          failures.push(`${sample.name}: longest task ${longest} ms exceeds ${taskCeiling} ms`);
      }
      if (
        sample.name.startsWith('route-assets-') &&
        (!(sample.javascriptBytes! > 0) ||
          sample.javascriptBytes! > (routeAssetBudgets[sample.name]?.javascriptBytes ?? 0) ||
          !(sample.cssBytes! > 0) ||
          sample.cssBytes! > (routeAssetBudgets[sample.name]?.cssBytes ?? 0))
      )
        failures.push(`${sample.name}: asset budget exceeded or missing`);
      if (
        ['course-open', 'cards-open', 'answer-reveal', 'review-next-card'].includes(sample.name) &&
        sample.inputToReadableMs === undefined
      )
        failures.push(`${sample.name}: input-to-readable evidence is missing`);
      const inputCeiling = inputBudgetsMs[sample.name] ?? 750;
      if (
        sample.inputToReadableMs !== undefined &&
        (!Number.isFinite(sample.inputToReadableMs) ||
          sample.inputToReadableMs < 0 ||
          sample.inputToReadableMs > inputCeiling)
      )
        failures.push(`${sample.name}: input-to-readable exceeds ${inputCeiling} ms`);
    }
  }
  return failures;
}
