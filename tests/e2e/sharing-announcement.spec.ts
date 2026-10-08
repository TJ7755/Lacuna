import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 768, 1440]) {
  test(`keeps the sharing announcement to one slim row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);

    const banner = page.getByRole('region', { name: 'New sharing features' });
    await expect(banner).toBeVisible();
    const bounds = (await banner.boundingBox())!;
    // The 44px dismiss target plus the row's padding: no second row of content.
    expect(bounds.height).toBeLessThanOrEqual(57);
    // The message itself never wraps onto a second line.
    expect((await banner.locator('p').boundingBox())!.height).toBeLessThanOrEqual(24);
    for (const control of [
      banner.getByRole('link', { name: 'Explore sharing' }),
      banner.getByRole('button', { name: 'Dismiss announcement' }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test('keeps the application usable when the optional announcement fails to load', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    let blocked = false;
    await page.route(/\/assets\/SharingAnnouncement-[A-Za-z0-9_-]{8}\.js$/, (route) => {
      blocked = true;
      return route.abort();
    });
    await enterFreshLacuna(page);
    await expect.poll(() => blocked).toBe(true);
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Course name' })).toBeVisible();
  } finally {
    await context.close();
  }
});
