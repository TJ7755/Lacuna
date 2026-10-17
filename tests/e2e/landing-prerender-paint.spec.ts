import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const homepage = readFileSync('dist/index.html', 'utf8');

for (const scenario of [
  { name: 'first visit', hash: '', hidden: false },
  { name: 'first-visit anchor', hash: '#how-it-works', hidden: false },
  { name: 'returning browser', hash: '', seeded: '1', hidden: true },
  { name: 'light-theme returning browser', hash: '', seeded: '1', theme: 'light', hidden: true },
  { name: 'returning browser with an empty seed flag', hash: '', seeded: '', hidden: true },
  { name: 'returning browser anchor', hash: '#how-it-works', seeded: '1', hidden: true },
  { name: 'app hash route', hash: '#/cards', hidden: true },
  { name: 'storage denied', hash: '', storageDenied: true, hidden: false },
  { name: 'storage-denied anchor', hash: '#how-it-works', storageDenied: true, hidden: false },
  { name: 'storage-denied app route', hash: '#/', storageDenied: true, hidden: true },
  { name: 'packaged app', hash: '', isElectron: true, hidden: true },
]) {
  test(`prerender before app modules: ${scenario.name}`, async ({ page }) => {
    await page.addInitScript(
      ({ seeded, storageDenied, isElectron, theme }) => {
        localStorage.setItem('lacuna-theme', theme);
        if (seeded !== undefined) localStorage.setItem('lacuna-seeded', seeded);
        if (storageDenied) {
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Storage denied', 'SecurityError');
            },
          });
        }
        if (isElectron)
          Object.defineProperty(window, 'electronAPI', { value: { isElectron: true } });
      },
      {
        seeded: 'seeded' in scenario ? scenario.seeded : undefined,
        storageDenied: 'storageDenied' in scenario,
        isElectron: 'isElectron' in scenario,
        theme: 'theme' in scenario ? (scenario.theme ?? 'dark') : 'dark',
      },
    );
    // Paint the actual built document before any external CSS or modules arrive.
    // Dev HTML has no landing tree and cannot reproduce this pre-module paint.
    await page.route('**/*', (route) =>
      route.request().resourceType() === 'document'
        ? route.fulfill({ contentType: 'text/html', body: homepage })
        : route.abort(),
    );
    await page.goto(`/${scenario.hash}`);
    const landing = page.locator('#root .landing-page');
    await expect(landing).toBeAttached();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if ('theme' in scenario) {
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    } else {
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
    if (scenario.hidden) {
      await expect(landing).toBeHidden();
      await expect(page.locator('html')).toHaveCSS(
        'background-color',
        'theme' in scenario ? 'rgb(241, 244, 235)' : 'rgb(10, 11, 9)',
      );
      expect(
        await page.locator('#root').evaluate((root) => root.getBoundingClientRect().height),
      ).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerHeight),
      );
    } else {
      await expect(landing).toBeVisible();
    }
  });
}
