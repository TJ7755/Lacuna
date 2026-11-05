import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { skipOnboarding } from '../e2e/fixtures/lacunaApp';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);

test('Windows integrates working window controls without a separate title bar', async ({
  browserName: _browserName,
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows custom window controls.');
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-window-chrome-')));
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      executablePath: require('electron') as string,
      args: [root, `--user-data-dir=${profile}`],
    });
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await skipOnboarding(page);
    const nativeWindow = await app.browserWindow(page);
    await nativeWindow.evaluate((window) => {
      window.unmaximize();
      window.setSize(1400, 900);
    });

    await expect(page.getByTestId('titlebar-brand')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-brand-mark')).toBeVisible();
    expect(
      await page.locator('aside:visible').evaluate((node) => node.getBoundingClientRect().top),
    ).toBe(0);
    const close = page.getByRole('button', { name: 'Close', exact: true });
    const controls = await close.boundingBox();
    expect(controls?.y).toBe(0);
    expect(controls?.height).toBe(32);
    expect(await page.locator('main').evaluate((node) => node.getBoundingClientRect().top)).toBe(
      32,
    );
    expect(
      await page
        .locator('.titlebar-drag')
        .evaluate((node) => getComputedStyle(node).getPropertyValue('-webkit-app-region')),
    ).toBe('drag');
    expect(
      await close.evaluate((node) =>
        getComputedStyle(node.parentElement!).getPropertyValue('-webkit-app-region'),
      ),
    ).toBe('no-drag');
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await expect(page.getByRole('form', { name: 'New course' })).toBeVisible();
    await page.keyboard.press('Escape');
    const screenshot = testInfo.outputPath('desktop-window-chrome.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('desktop-window-chrome.png', {
      path: screenshot,
      contentType: 'image/png',
    });

    await page.getByRole('button', { name: 'Maximise', exact: true }).click();
    await expect.poll(() => nativeWindow.evaluate((window) => window.isMaximized())).toBe(true);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect.poll(() => nativeWindow.evaluate((window) => window.isMaximized())).toBe(false);
    await page.getByRole('button', { name: 'Minimise', exact: true }).click();
    await expect.poll(() => nativeWindow.evaluate((window) => window.isMinimized())).toBe(true);
    await nativeWindow.evaluate((window) => window.restore());
    await expect.poll(() => nativeWindow.evaluate((window) => window.isMinimized())).toBe(false);
    const closed = page.waitForEvent('close');
    await close.click();
    await closed;
  } finally {
    try {
      await app?.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
});
