import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const service = 'https://lacuna-beta-one.vercel.app';

test('Electron connects to the hosted service and shows its streamed reply', async () => {
  test.skip(process.platform !== 'darwin' && process.platform !== 'win32');
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-hosted-ai-')));
  let app: ElectronApplication | undefined;
  const requests: string[] = [];
  try {
    const packaged = Boolean(process.env.LACUNA_ELECTRON_APP_DIR);
    const devExecutable: unknown = require('electron');
    if (!packaged && typeof devExecutable !== 'string') throw new Error('Electron executable unavailable.');
    const executablePath = packaged
      ? await resolvePackagedExecutable({ appDir: process.env.LACUNA_ELECTRON_APP_DIR })
      : devExecutable as string;
    app = await electron.launch({ executablePath,
      args: packaged ? [`--user-data-dir=${profile}`] : [root, `--user-data-dir=${profile}`] });
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
        await route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
          body: JSON.stringify({ token: 'electron-session', expiresAt: Date.now() + 3_600_000 }) });
        return;
      }
      await route.fulfill({ status: 200,
        headers: { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        body: '{"type":"text_delta","text":"Electron hosted reply."}\n' +
          '{"type":"completed","finishReason":"stop"}\n' });
    });
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
    await page.getByRole('radio', { name: 'Built-in AI' }).click();
    await page.getByRole('switch', { name: 'Enable AI' }).click();
    await page.getByRole('button', { name: 'AI', exact: true }).first().click();
    await page.getByLabel('Access code').fill('fixture-access-code-with-at-least-thirty-two-characters');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('Built-in AI connected')).toBeVisible();
    await page.getByRole('textbox', { name: 'Message AI' }).fill('Check Electron hosted transport.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Electron hosted reply.')).toBeVisible();
    expect(requests.some((url) => url.endsWith('/session'))).toBe(true);
    expect(requests.some((url) => url.endsWith('/inference'))).toBe(true);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
