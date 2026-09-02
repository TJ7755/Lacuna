import { expect, test } from '@playwright/test';
import { realpath } from 'node:fs/promises';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';
import { runPackagedMemorySuite } from '../../scripts/electron-performance/memory-harness';
import { MEMORY_CHECKPOINT_ORDER } from '../../scripts/electron-performance/memory-workflow';

test('packaged Electron renderer retention uses one launch and retains raw samples', async ({
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
    expect(Object.keys(checkpoint.samples[0]!).sort()).toEqual(['renderer', 'sampledAt']);
    expect(Object.keys(checkpoint.samples[0]!.renderer).sort()).toEqual([
      'backingStorageBytes',
      'documents',
      'heapTotalBytes',
      'heapUsedBytes',
      'jsEventListeners',
      'nodes',
    ]);
    expect(
      checkpoint.samples.every((sample) =>
        Object.values(sample.renderer).every(
          (value) => Number.isFinite(value) && Number(value) >= 0,
        ),
      ),
    ).toBe(true);
  }
});
