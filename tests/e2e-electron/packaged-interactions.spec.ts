import { expect, test } from '@playwright/test';
import { runPackagedInteractionSuite } from '../../scripts/electron-performance/harness';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';

test('packaged interactions use the real application with normal motion', async ({
  browserName: _browserName,
}, testInfo) => {
  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });

  const suite = await runPackagedInteractionSuite({ executablePath });
  expect(suite.launch.packaged).toBe(true);
  expect(suite.launch.rendererProtocol).toBe('app:');
  expect(suite.launch.viteResourceCount).toBe(0);
  expect(suite.launch.appVersion.length).toBeGreaterThan(0);
  expect(suite.processExit.exitCode).toBe(0);
  expect(suite.processExit.signalCode).toBeNull();
  expect(suite.samples.map((sample) => sample.scenario)).toEqual(['search', 'settings', 'course']);

  for (const sample of suite.samples) {
    await testInfo.attach(`${sample.scenario}-interaction.json`, {
      body: Buffer.from(JSON.stringify(sample, null, 2)),
      contentType: 'application/json',
    });
  }
});
