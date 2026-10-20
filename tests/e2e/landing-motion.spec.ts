import { expect, test } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`the headline hands over to the fixed header with ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/welcome');
    await page.evaluate(() => document.fonts.ready);
    const nav = page.getByRole('navigation', { name: 'Landing navigation' });
    const headline = page.getByRole('heading', { level: 1 });
    await expect(nav).toHaveCSS('position', 'fixed');
    const brand = nav.locator('.landing-brand');
    const mark = nav.locator('.motion-nav-mark');

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect(brand).toHaveCSS('opacity', '1');
      await expect(brand).toHaveAttribute('aria-hidden', 'false');
      await expect(brand).toHaveAttribute('tabindex', '0');
      await expect(mark).toHaveCSS('opacity', '0');
      await expect(mark).toHaveAttribute('aria-hidden', 'true');
      await expect(mark).toHaveAttribute('tabindex', '-1');
      await expect(headline).toBeInViewport();
      await expect(
        headline.locator('..').getByRole('link', { name: 'Start revising' }),
      ).toBeInViewport();

      // Keep the wordmark until the headline clears the fixed navigation.
      await headline.evaluate(async (element) => {
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().bottom - 120,
          behavior: 'instant',
        });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await expect(brand).toHaveCSS('opacity', '1');
      await expect(mark).toHaveCSS('opacity', '0');
      await headline.evaluate((element) =>
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().bottom - 72,
          behavior: 'instant',
        }),
      );
      await expect(mark).toHaveCSS('opacity', '1');
      await expect(mark).toHaveAttribute('aria-hidden', 'false');
      await expect(mark).toHaveAttribute('tabindex', '0');
      await expect(brand).toHaveCSS('opacity', '0');
      await expect(brand).toHaveAttribute('aria-hidden', 'true');
      await expect(brand).toHaveAttribute('tabindex', '-1');
      await expect(nav).toBeInViewport();
      const box = await mark.boundingBox();
      expect(box!.x + box!.width / 2).toBeCloseTo(width / 2, 0);
      await expect(nav.getByRole('link', { name: 'Download for desktop' })).toBeInViewport();
      if (reducedMotion === 'reduce') {
        await expect(mark).toHaveCSS('transition-property', 'none');
        await expect(brand).toHaveCSS('transition-property', 'none');
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect(mark).toHaveCSS('opacity', '0');
      await expect(brand).toHaveCSS('opacity', '1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}

test('landing keeps a stable promise, accessible motion control and direct entry', async ({
  page,
}) => {
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'Your revision, built around your exam.',
  );
  const reel = hero.locator('.revision-reel');
  await expect(reel).toHaveAttribute('aria-hidden', 'true');
  await expect(reel.locator('.revision-object')).toHaveCount(12);
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
