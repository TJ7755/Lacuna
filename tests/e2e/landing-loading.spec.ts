import { expect, test } from '@playwright/test';

test('landing enters the app before its optional idle warm-up', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 1;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause illustrations' }).click();
  await expect(page.getByRole('button', { name: 'Play illustrations' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Revision around your exam' })
    .getByRole('link', { name: 'Start revising' })
    .click();
  await expect(page.getByRole('button', { name: 'Show answer', exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a landing-only installation can open Import offline without the HTTP cache', async ({
  playwright,
}, testInfo) => {
  // Clearing Chromium's HTTP cache affects the entire browser process.
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  try {
    // Do not let the optional idle warm-up fetch the study root for this proof.
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 1;
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Pause illustrations' }).click();
    await expect(page.getByRole('button', { name: 'Play illustrations' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.clearBrowserCache');
    await context.setOffline(true);
    await page.goto('/#/import');
    await expect(page.getByLabel('Import file', { exact: true })).toBeAttached();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-app-starting');
    await session.detach();
  } finally {
    await browser.close();
  }
});

test('a failed landing handover download recovers through the existing stale-chunk reload', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    let failed = false;
    let documents = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) documents += 1;
    });
    await page.route('**/assets/app-*.js', (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.abort('failed');
    });
    await page.goto('/');
    await expect.poll(() => documents).toBe(2);
    await page.getByRole('button', { name: 'Pause illustrations' }).click();
    await expect(page.getByRole('button', { name: 'Play illustrations' })).toBeVisible();
    expect(failed).toBe(true);
    expect(documents).toBe(2);
    expect(
      await page.evaluate(() => sessionStorage.getItem('lacuna-stale-chunk-recovery-at')),
    ).not.toBeNull();
  } finally {
    await context.close();
  }
});
