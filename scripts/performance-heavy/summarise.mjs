import { readFile } from 'node:fs/promises';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass one or more performance JSON reports.');
const columns = [];
for (const path of paths) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.smoke) throw new Error(`${path} is a smoke fixture, not heavy-load evidence.`);
  for (const run of report.runs) columns.push({ report, run });
}
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const timings = [
  ['Dashboard first load', 'dashboard-load', (sample) => sample.iteration === 0],
  ['Dashboard warm reload', 'dashboard-load', (sample) => sample.iteration > 0],
  ['Global search', 'global-search'],
  ['Open course', 'course-open'],
  ['Open Cards', 'cards-open'],
  ['Filter Cards', 'cards-search'],
  ['Open study', 'study-open'],
  ['Reveal answer', 'answer-reveal'],
  ['Answer input to readable', 'answer-reveal', () => true, 'inputToReadableMs'],
  ['Grade and show next Card', 'review-next-card'],
  ['Grade input to readable', 'review-next-card', () => true, 'inputToReadableMs'],
  ['Burst reveal answer', 'burst-answer-reveal'],
  ['Burst answer input to readable', 'burst-answer-reveal', () => true, 'inputToReadableMs'],
  ['Burst grade and show next Card', 'burst-review-next-card'],
  ['Burst grade input to readable', 'burst-review-next-card', () => true, 'inputToReadableMs'],
  ['Export backup', 'backup-export'],
  ['Preview backup', 'backup-preview'],
  ['Replace from backup', 'backup-replace'],
];
const rows = timings.map(([label, name, filter = () => true, metric = 'elapsedMs']) => [
  label + ' (ms)',
  ...columns.map(({ run }) => {
    const matching = run.samples.filter((sample) => sample.name === name && filter(sample));
    const failures = matching.filter((sample) => sample.failed);
    if (failures.length)
      return `FAILED after ${Math.round(Math.max(...failures.map((sample) => sample.elapsedMs)))} ms`;
    const values = matching
      .map((sample) => sample[metric])
      .filter((value) => typeof value === 'number');
    if (!values.length) return 'Not completed';
    const format = (value) => Math.round(value).toLocaleString('en-GB');
    return values.length === 1
      ? `${format(values[0])} (n=1)`
      : `${format(median(values))} / ${format(Math.max(...values))}`;
  }),
]);
rows.push([
  'Largest sampled JS heap (MiB)',
  ...columns.map(({ run }) =>
    Math.round(Math.max(...run.samples.map((sample) => sample.jsHeapUsedBytes ?? 0)) / 2 ** 20),
  ),
]);
rows.push([
  'Minimum guest available RAM (MiB)',
  ...columns.map(({ run }) =>
    run.memorySamples.length
      ? Math.round(Math.min(...run.memorySamples.map((sample) => sample.availableKiB)) / 1024)
      : '—',
  ),
]);
rows.push([
  'Maximum guest swap used (MiB)',
  ...columns.map(({ run }) =>
    run.memorySamples.length
      ? Math.round(Math.max(...run.memorySamples.map((sample) => sample.swapUsedKiB)) / 1024)
      : '—',
  ),
]);
rows.push([
  'Guest OOM kills during measurements',
  ...columns.map(({ run }) =>
    run.memorySamples.length ? run.memorySamples.at(-1).oomKills - run.memoryBefore.oomKills : '—',
  ),
]);
rows.push(['Recorded errors', ...columns.map(({ run }) => run.errors.length)]);

console.log(
  '| Measurement | ' +
    columns.map(({ report, run }) => `${report.label}, ${run.rate}×`).join(' | ') +
    ' |',
);
console.log('| --- | ' + columns.map(() => '---:').join(' | ') + ' |');
for (const row of rows) console.log('| ' + row.join(' | ') + ' |');
console.log(
  '\nTiming cells show median / slowest observed. First load and each backup operation are single measurements (n=1). Three repetitions cannot establish a guaranteed worst case.',
);
console.log(
  'JavaScript heap is sampled at operation boundaries, not total application memory. Linux memory is whole-guest memory sampled every 500 ms.',
);
