import { expect, test } from '@playwright/test';
import { realpath } from 'node:fs/promises';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';
import { runPackagedMemorySuite } from '../../scripts/electron-performance/memory-harness';
import { MEMORY_CHECKPOINT_ORDER } from '../../scripts/electron-performance/memory-workflow';

test('packaged Electron memory uses one real application launch and retains raw samples', async ({
  browserName: _browserName,
}, testInfo) => {
  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });
  expect(executablePath).toBe(await realpath(executablePath));

  const report = await runPackagedMemorySuite({ executablePath });
  await testInfo.attach('packaged-memory.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  });

  expect(report.launch).toEqual({
    packaged: true,
    rendererProtocol: 'app:',
    viteResourceCount: 0,
  });
  expect(report.processExit.exitCode).toBe(0);
  expect(report.processExit.signalCode).toBeNull();
  expect(report.samplePolicy).toEqual({
    samplesPerCheckpoint: 9,
    sampleIntervalMs: 250,
    forcedGc: false,
  });
  expect(report.fixture).toEqual({
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    courses: 1,
    lessons: 100,
    cards: 10_000,
  });
  expect(report.host.osRelease).not.toHaveLength(0);
  expect(report.host.machineFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(report.executable.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.executable.appAsarSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.executable.harnessGitSha).toMatch(/^[a-f0-9]{40}$/);
  expect(report.checkpoints.map((entry) => entry.checkpoint)).toEqual(MEMORY_CHECKPOINT_ORDER);
  for (const checkpoint of report.checkpoints) {
    expect(checkpoint.samples).toHaveLength(9);
    expect(
      checkpoint.samples.every((sample) => sample.processes.some((entry) => entry.role === 'main')),
    ).toBe(true);
    expect(
      checkpoint.samples.every((sample) =>
        sample.processes.some((entry) => entry.role === 'renderer'),
      ),
    ).toBe(true);
  }
});
