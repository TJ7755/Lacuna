import { expect, test } from '@playwright/test';
import { openEmptyDashboard } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`a slow page chunk shows feedback until arrival (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/assets/publicPages-*.js', async (route) => {
      await held;
      await route.continue();
    });
    try {
      await openEmptyDashboard(page);
      await page.evaluate(() => {
        window.location.hash = '#/privacy';
      });
      const loading = page.getByRole('status', { name: 'Loading', exact: true });
      await expect(loading).toBeVisible();
      await expect(loading.locator('svg')).toBeVisible();
      await testInfo.attach('Page waiting for its uncached chunk', {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
      release();
      await expect(page.getByRole('heading', { name: /Privacy/ }).first()).toBeVisible();
      await expect(loading).toBeHidden();
      await testInfo.attach('Page after its chunk arrives', {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    } finally {
      release();
    }
  });
}
