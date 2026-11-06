import { expect, test } from '@playwright/test';

test('first-run handover never mounts Today while onboarding loads', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('lacuna.landingHandover', '1');
    localStorage.setItem('lacuna-lesson-view-mode-migrated', '1');
    const headings: string[] = [];
    new MutationObserver(() => {
      for (const heading of document.querySelectorAll('h1')) {
        if (heading.textContent === 'Today') headings.push(heading.textContent);
      }
      sessionStorage.setItem('startup-headings', JSON.stringify(headings));
    }).observe(document, { childList: true, subtree: true });
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const request = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/assets/Onboarding-*.js', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  try {
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await request;
    // Keep the destination unavailable long enough for an accidental dashboard mount.
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Try a practice example' })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('startup-headings') ?? '[]')),
  ).toEqual([]);
  const screenshot = testInfo.outputPath('onboarding-arrival.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('Onboarding arrival', { path: screenshot, contentType: 'image/png' });
});
