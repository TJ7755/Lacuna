import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { cpus, hostname, release as operatingSystemRelease, tmpdir, totalmem } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { appAsarPathForExecutable } from './packaged-artifact';
import { closePackagedApp, launchPackagedApp } from './packaged-app';
import { createLargeMemoryFixture, fingerprintMemoryFixture } from './memory-fixture';
import { readRuntimeVersions } from './memory-probe';
import { MEMORY_SAMPLE_INTERVAL_MS, MEMORY_SAMPLES_PER_CHECKPOINT } from './memory-statistics';
import type { PackagedMemoryReport } from './memory-types';
import { runMemoryWorkflow } from './memory-workflow';
import { waitForSeededDashboard } from './renderer-interactions';
import type { PackagedLaunchProof, RunningPackagedApp } from './types';

const execFileAsync = promisify(execFile);

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function currentGitSha(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function machineFingerprint(): string {
  const identity = {
    hostname: hostname(),
    cpuModels: [...new Set(cpus().map((cpu) => cpu.model))].sort(),
    totalMemoryBytes: totalmem(),
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

async function resolveAppAsar(executablePath: string): Promise<string> {
  return realpath(appAsarPathForExecutable(executablePath));
}

function launchProof(running: RunningPackagedApp, executablePath: string): PackagedLaunchProof {
  return {
    executablePath,
    appVersion: running.appVersion,
    packaged: running.packaged,
    rendererProtocol: running.rendererProtocol,
    rendererUrl: running.rendererUrl,
    viteResourceCount: running.viteResourceCount,
  };
}

export async function runPackagedMemorySuite(options: {
  executablePath: string;
}): Promise<PackagedMemoryReport> {
  const rootDirectory = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-memory-')));
  const profileDirectory = path.join(rootDirectory, 'profile');
  const fixture = createLargeMemoryFixture();
  let running: RunningPackagedApp | undefined;
  let report: PackagedMemoryReport | undefined;
  let suiteError: unknown;
  try {
    running = await launchPackagedApp(options.executablePath, profileDirectory);
    await waitForSeededDashboard(running.page);
    if (running.errors.length > 0) {
      throw new Error(`The packaged launch reported errors:\n- ${running.errors.join('\n- ')}`);
    }
    const runtime = await readRuntimeVersions(running);
    const checkpoints = await runMemoryWorkflow({
      running,
      fixtureJson: JSON.stringify(fixture),
    });
    const errors = running.errors;
    if (errors.length > 0) {
      throw new Error(`The packaged memory workflow reported errors:\n- ${errors.join('\n- ')}`);
    }
    const proof = launchProof(running, options.executablePath);
    const processExit = await closePackagedApp(running);
    running = undefined;
    const appAsarPath = await resolveAppAsar(options.executablePath);
    report = {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      host: {
        platform: process.platform,
        arch: process.arch,
        osRelease: operatingSystemRelease(),
        machineFingerprint: machineFingerprint(),
      },
      runtime: { ...runtime, appVersion: proof.appVersion },
      executable: {
        path: options.executablePath,
        sha256: await sha256File(options.executablePath),
        appAsarPath,
        appAsarSha256: await sha256File(appAsarPath),
        harnessGitSha: await currentGitSha(),
      },
      fixture: {
        sha256: fingerprintMemoryFixture(fixture),
        courses: fixture.courses?.length ?? 0,
        lessons: fixture.lessons?.length ?? 0,
        cards: fixture.cards.length,
      },
      samplePolicy: {
        samplesPerCheckpoint: MEMORY_SAMPLES_PER_CHECKPOINT,
        sampleIntervalMs: MEMORY_SAMPLE_INTERVAL_MS,
        forcedGc: false,
      },
      checkpoints,
      launch: {
        packaged: proof.packaged,
        rendererProtocol: proof.rendererProtocol,
        viteResourceCount: proof.viteResourceCount,
      },
      processExit,
      note:
        process.platform === 'win32'
          ? 'Windows private bytes are the headline total. The sum of process working sets is a diagnostic proxy and can count shared Chromium mappings more than once. AI and MCP companion processes are not launched by this suite.'
          : process.platform === 'darwin'
            ? 'The sum of process working sets is a diagnostic proxy and can count shared Chromium mappings more than once. Total private memory is unavailable on macOS; main-process private, shared and resident figures remain in raw samples. AI and MCP companions are not launched.'
            : 'The sum of process working sets is a diagnostic proxy and can count shared Chromium mappings more than once. Main-process private and shared figures remain separate. AI and MCP companion processes are not launched by this suite.',
    };
  } catch (error) {
    suiteError = error;
  }

  if (running) {
    try {
      await closePackagedApp(running);
    } catch (error) {
      suiteError = suiteError
        ? new AggregateError([suiteError, error], 'The memory suite and its shutdown both failed.')
        : error;
    }
  }
  await rm(rootDirectory, { recursive: true, force: true });
  if (suiteError) throw suiteError;
  if (!report) throw new Error('The packaged memory suite ended without a report.');
  return report;
}
