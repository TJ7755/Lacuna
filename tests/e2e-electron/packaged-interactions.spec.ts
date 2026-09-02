import { expect, test } from '@playwright/test';
import { realpath } from 'node:fs/promises';
import { runPackagedInteractionSuite } from '../../scripts/electron-performance/harness';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';

test('packaged interactions use the real application with normal motion', async ({
  browserName: _browserName,
}, testInfo) => {
  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });
  expect(executablePath).toBe(await realpath(executablePath));

  const suite = await runPackagedInteractionSuite({
    executablePath,
    measurements: (['search', 'settings', 'course'] as const).map((scenario) => ({
      scenario,
      idleDelayMs: 0,
    })),
  });
  expect(suite.launch.executablePath).toBe(executablePath);
  expect(suite.launch.packaged).toBe(true);
  expect(suite.launch.rendererProtocol).toBe('app:');
  expect(suite.launch.viteResourceCount).toBe(0);
  expect(suite.launch.appVersion.length).toBeGreaterThan(0);
  expect(suite.processExit.exitCode).toBe(0);
  expect(suite.processExit.signalCode).toBeNull();

  for (const sample of suite.samples) {
    await testInfo.attach(`${sample.scenario}-interaction.json`, {
      body: Buffer.from(JSON.stringify(sample, null, 2)),
      contentType: 'application/json',
    });

    expect(sample.packaged).toBe(true);
    expect(sample.executablePath).toBe(executablePath);
    expect(sample.appVersion).toBe(suite.launch.appVersion);
    expect(sample.rendererProtocol).toBe('app:');
    expect(sample.viteResourceCount).toBe(0);
    expect(sample.reducedMotion).toBe(false);
    expect(sample.motionSpeed).toBe('normal');
    expect(sample.inputToFeedbackMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sample.inputToFeedbackMs)).toBe(true);
    expect(sample.inputToUsableMs).toBeGreaterThanOrEqual(sample.inputToFeedbackMs);
    expect(Number.isFinite(sample.inputToUsableMs)).toBe(true);
    expect(sample.inputToSettledMs).toBeGreaterThanOrEqual(sample.inputToUsableMs);
    expect(Number.isFinite(sample.inputToSettledMs)).toBe(true);
    expect(
      sample.finiteAnimationDurationsMs.every(
        (duration) => Number.isFinite(duration) && duration > 0,
      ),
    ).toBe(true);
    expect(Number.isFinite(sample.longTaskCount)).toBe(true);
    expect(Number.isFinite(sample.longTaskTotalMs)).toBe(true);
    expect(Number.isFinite(sample.longestLongTaskMs)).toBe(true);
    expect(sample.longTaskCount).toBeGreaterThanOrEqual(0);
    expect(sample.longTaskTotalMs).toBeGreaterThanOrEqual(0);
    expect(sample.longestLongTaskMs).toBeGreaterThanOrEqual(0);
    expect(sample.errors).toEqual([]);
  }
});
