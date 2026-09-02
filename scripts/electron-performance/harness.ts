import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closePackagedApp, launchPackagedApp } from './packaged-app';
import { runPackagedInteractionSample, waitForSeededDashboard } from './renderer-interactions';
import type {
  PackagedInteractionMeasurement,
  PackagedInteractionSample,
  PackagedInteractionSuiteResult,
  PackagedLaunchProof,
  RunningPackagedApp,
} from './types';

export type {
  InteractionScenario,
  PackagedInteractionMeasurement,
  PackagedInteractionSample,
  PackagedInteractionSuiteResult,
  PackagedLaunchProof,
  PackagedProcessExit,
} from './types';

export async function runPackagedInteractionSuite(options: {
  executablePath: string;
  measurements: readonly PackagedInteractionMeasurement[];
}): Promise<PackagedInteractionSuiteResult> {
  if (options.measurements.length === 0) {
    throw new Error('The packaged interaction suite requires at least one measurement.');
  }
  const rootDirectory = await realpath(
    await mkdtemp(path.join(tmpdir(), 'lacuna-packaged-performance-')),
  );
  const profileDirectory = path.join(rootDirectory, 'profile');
  let running: RunningPackagedApp | undefined;
  let result: PackagedInteractionSuiteResult | undefined;
  let suiteError: unknown;
  try {
    running = await launchPackagedApp(options.executablePath, profileDirectory);
    await waitForSeededDashboard(running.page);
    if (running.errors.length > 0) {
      throw new Error(`The packaged launch reported errors:\n- ${running.errors.join('\n- ')}`);
    }
    const launch: PackagedLaunchProof = {
      executablePath: options.executablePath,
      appVersion: running.appVersion,
      packaged: running.packaged,
      rendererProtocol: running.rendererProtocol,
      rendererUrl: running.rendererUrl,
      viteResourceCount: running.viteResourceCount,
    };
    const samples: PackagedInteractionSample[] = [];
    for (const measurement of options.measurements) {
      const sample = await runPackagedInteractionSample({
        running,
        executablePath: options.executablePath,
        ...measurement,
      });
      assertPackagedInteractionSample(sample);
      samples.push(sample);
    }
    const processExit = await closePackagedApp(running);
    running = undefined;
    result = { launch, processExit, samples };
  } catch (error) {
    suiteError = error;
  }

  if (running) {
    try {
      await closePackagedApp(running);
    } catch (error) {
      suiteError = suiteError
        ? new AggregateError(
            [suiteError, error],
            'The packaged suite and its shutdown both failed.',
          )
        : error;
    }
  }
  await rm(rootDirectory, { recursive: true, force: true });
  if (suiteError) throw suiteError;
  if (!result) throw new Error('The packaged interaction suite ended without a result.');
  return result;
}

export function assertPackagedInteractionSample(sample: PackagedInteractionSample): void {
  if (!sample.packaged || sample.rendererProtocol !== 'app:' || sample.viteResourceCount !== 0) {
    throw new Error(`${sample.scenario} did not run against the packaged app renderer.`);
  }
  if (sample.reducedMotion || sample.motionSpeed !== 'normal') {
    throw new Error(`${sample.scenario} did not run with normal motion.`);
  }
  const timings = [sample.inputToFeedbackMs, sample.inputToUsableMs, sample.inputToSettledMs];
  if (timings.some((timing) => !Number.isFinite(timing) || timing < 0)) {
    throw new Error(`${sample.scenario} reported a non-finite or negative interaction timing.`);
  }
  if (
    sample.inputToUsableMs < sample.inputToFeedbackMs ||
    sample.inputToSettledMs < sample.inputToUsableMs
  ) {
    throw new Error(`${sample.scenario} reported interaction boundaries out of order.`);
  }
  if (
    sample.finiteAnimationDurationsMs.some(
      (duration) => !Number.isFinite(duration) || duration <= 0,
    )
  ) {
    throw new Error(`${sample.scenario} reported an invalid finite animation duration.`);
  }
  const longTaskValues = [sample.longTaskCount, sample.longTaskTotalMs, sample.longestLongTaskMs];
  if (longTaskValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`${sample.scenario} reported invalid Long Task data.`);
  }
  if (sample.errors.length > 0) {
    throw new Error(
      `${sample.scenario} reported renderer errors:\n- ${sample.errors.join('\n- ')}`,
    );
  }
}
