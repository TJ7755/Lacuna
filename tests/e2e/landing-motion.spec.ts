import { expect, test } from '@playwright/test';

test('landing keeps a stable promise, accessible motion control and direct entry', async ({
  page,
}) => {
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  const reel = hero.locator('.revision-reel');
  await expect(reel).toHaveAttribute('aria-hidden', 'true');
  const tile = reel.locator('.revision-object').first();
  const transforms = () =>
    reel
      .locator('.revision-object')
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).transform).join('|'));
  const before = await transforms();
  await expect.poll(transforms).not.toBe(before);
  await page.getByRole('button', { name: 'Pause illustrations' }).click();
  await expect(tile).toHaveCSS('animation-play-state', 'paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(tile).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(hero.getByRole('link', { name: 'Start revising' })).toBeInViewport();
  await hero.getByRole('link', { name: 'See how it works' }).click();
  await expect(
    page.getByRole('heading', { name: 'Scheduled for your exam, not for ever.' }),
  ).toBeInViewport();
  await hero.getByRole('link', { name: 'Start revising' }).click();
  await expect(page).toHaveURL(/#\/$/);
});
