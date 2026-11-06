import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';
import { createCourse } from '../e2e/fixtures/lacunaApp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const service = 'https://getlacuna.app';

test('Electron keeps Jev access without the AI chat interface', async () => {
  test.skip(process.platform !== 'darwin' && process.platform !== 'win32');
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-hosted-ai-')));
  let app: ElectronApplication | undefined;
  const requests: string[] = [];
  try {
    const packaged = Boolean(process.env.LACUNA_ELECTRON_APP_DIR);
    const devExecutable: unknown = require('electron');
    if (!packaged && typeof devExecutable !== 'string')
      throw new Error('Electron executable unavailable.');
    const executablePath = packaged
      ? await resolvePackagedExecutable({ appDir: process.env.LACUNA_ELECTRON_APP_DIR })
      : (devExecutable as string);
    app = await electron.launch({
      executablePath,
      args: packaged ? [`--user-data-dir=${profile}`] : [root, `--user-data-dir=${profile}`],
    });
    const page = await app.firstWindow();
    const rendererOrigin = packaged ? 'app://.' : new URL(page.url()).origin;
    const cors = {
      'Access-Control-Allow-Origin': rendererOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(`${service}/api/ai/**`, async (route) => {
      requests.push(route.request().url());
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      if (route.request().url().endsWith('/session')) {
        await route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'electron-session', expiresAt: Date.now() + 3_600_000 }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'jev-1.14.0', value: 1, confidence: 0.99, inputTokens: 12 }),
      });
    });
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    // A fresh profile enters through onboarding; Exit leaves it for Today.
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
    await page.getByRole('button', { name: /^Integrations/ }).click();
    await expect(page.getByRole('switch', { name: 'Enable AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Mark my answers automatically' }).click();
    await page.getByRole('checkbox', { name: /I understand/ }).check();
    await page.getByRole('button', { name: 'Turn on', exact: true }).click();
    await expect(page.getByLabel('Access code')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Mark my answers automatically' })).toBeChecked();
    expect(requests).toEqual([]);
    await page.evaluate(() => {
      localStorage.setItem('lacuna.answerInput', 'type');
      window.location.hash = '#/';
    });
    await page.reload();
    await createCourse(page, 'Jev public beta');
    const courseId = new URL(page.url()).hash.split('/')[2];
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front', exact: true }).fill('What do plants absorb?');
    await page.getByRole('textbox', { name: 'Back', exact: true }).fill('Carbon dioxide');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.evaluate((id) => {
      window.location.hash = `#/course/${id}/learn?mode=simple`;
    }, courseId);
    await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('CO2');
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.getByRole('main', { name: 'Session report' })).toBeVisible();
    expect(requests.some((url) => url.endsWith('/session'))).toBe(true);
    expect(requests.filter((url) => url.endsWith('/jev'))).toHaveLength(1);
    expect(requests.some((url) => url.endsWith('/inference'))).toBe(false);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('main', { name: 'Session report' })).toHaveCount(0);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
