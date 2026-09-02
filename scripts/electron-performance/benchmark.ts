import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runPackagedInteractionSuite,
  type InteractionScenario,
  type PackagedInteractionSample,
} from './harness';
import { argumentValue, resolvePackagedExecutable } from './executable';
import { summariseDistribution } from './statistics';

const args = process.argv.slice(2);

function nonNegativeInteger(name: string, fallback: number): number {
  const raw = argumentValue(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function selectedScenarios(): InteractionScenario[] {
  const raw = argumentValue(args, '--scenarios') ?? 'search,settings,course';
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set<InteractionScenario>(['search', 'settings', 'course']);
  if (values.length === 0 || values.some((value) => !allowed.has(value as InteractionScenario))) {
    throw new Error('--scenarios must contain search, settings or course.');
  }
  return values as InteractionScenario[];
}

function summariseSamples(samples: readonly PackagedInteractionSample[]) {
  return {
    inputToFeedbackMs: summariseDistribution(samples.map((sample) => sample.inputToFeedbackMs)),
    inputToUsableMs: summariseDistribution(samples.map((sample) => sample.inputToUsableMs)),
    inputToSettledMs: summariseDistribution(samples.map((sample) => sample.inputToSettledMs)),
    longTaskCount: summariseDistribution(samples.map((sample) => sample.longTaskCount)),
    longTaskTotalMs: summariseDistribution(samples.map((sample) => sample.longTaskTotalMs)),
    longestLongTaskMs: summariseDistribution(samples.map((sample) => sample.longestLongTaskMs)),
  };
}

const idleDelayMs = nonNegativeInteger('--idle-ms', 8_000);
const scenarios = selectedScenarios();
const executablePath = await resolvePackagedExecutable({
  appDir: argumentValue(args, '--app-dir'),
});
const outputPath = argumentValue(args, '--output');
const measurements = scenarios.flatMap((scenario) => [
  { scenario, idleDelayMs: 0 },
  { scenario, idleDelayMs },
]);
const suite = await runPackagedInteractionSuite({
  executablePath,
  measurements,
});
const samples: PackagedInteractionSample[] = suite.samples;
process.stderr.write(`Single-process packaged suite passed for ${path.basename(executablePath)}\n`);

const grouped = Object.fromEntries(
  scenarios.map((scenario) => [
    scenario,
    Object.fromEntries(
      [
        ['immediate', 0],
        ['idle', idleDelayMs],
      ].map(([control, delayMs]) => {
        const group = samples.filter(
          (sample) => sample.scenario === scenario && sample.idleDelayMs === delayMs,
        );
        return [control, { summary: summariseSamples(group), samples: group }];
      }),
    ),
  ]),
);
const report = {
  measuredAt: new Date().toISOString(),
  host: { platform: process.platform, arch: process.arch },
  executablePath,
  launchProof: suite.launch,
  processExit: suite.processExit,
  appVersion: samples[0]?.appVersion,
  packagedLaunches: 1,
  runsPerControl: 1,
  idleDelayMs,
  note: 'Each control is sampled once in one packaged process. Timing is diagnostic evidence only; no absolute threshold is enforced.',
  scenarios: grouped,
};
const json = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, json, 'utf8');
  process.stderr.write(`Wrote ${resolvedOutput}\n`);
} else {
  process.stdout.write(json);
}
