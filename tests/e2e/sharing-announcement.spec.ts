import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('keeps the sharing illustration inside the banner beside the desktop sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await enterFreshLacuna(page);

  const banner = page.getByRole('region', { name: 'New sharing features' });
  const message = banner.locator(':scope > div').first();
  const illustration = banner.locator('.sharing-announcement-sheet');
  await expect(banner).toBeVisible();
  const bannerBounds = await banner.boundingBox();
  const illustrationBounds = await illustration.boundingBox();
  const messageBounds = await message.boundingBox();
  expect(bannerBounds).not.toBeNull();
  expect(illustrationBounds).not.toBeNull();
  expect(messageBounds).not.toBeNull();
  expect(illustrationBounds!.y).toBeGreaterThanOrEqual(messageBounds!.y + messageBounds!.height);
  expect(illustrationBounds!.x).toBeGreaterThanOrEqual(bannerBounds!.x);
  expect(illustrationBounds!.x + illustrationBounds!.width).toBeLessThanOrEqual(
    bannerBounds!.x + bannerBounds!.width,
  );
});

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
    await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Course name' })).toBeVisible();
  } finally {
    await context.close();
  }
});
