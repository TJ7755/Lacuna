import { expect, test } from '@playwright/test';
import { landingFilms } from '../../src/components/landing/films';

for (const width of [1280, 390]) {
  for (const [key, film] of Object.entries(landingFilms)) {
    test(`${key} film keeps its poster and navigation when blocked at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('**/films/*.mp4', (route) => route.abort('blockedbyclient'));
      await page.goto('/#/landing');

      const play = page.getByRole('button', { name: `Watch ${film.title}, ${film.duration}` });
      await play.focus();
      await play.press('Enter');
      const status = page
        .getByRole('status')
        .filter({ has: page.getByRole('link', { name: 'Open the video directly' }) });
      await expect(status).toBeVisible();
      const section = status.locator('..');
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`${key}-${width}.png`),
      });

      await expect(section.locator('video')).toHaveCount(0);
      const poster = section.getByRole('img', { name: film.title });
      await expect(poster).toBeVisible();
      expect(
        await poster.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await expect(status).toBeFocused();
      await expect(status.getByRole('link')).toHaveAttribute('href', film.externalSrc);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.getByRole('link', { name: 'Open Gaps' }).focus();
      await expect(page.getByRole('link', { name: 'Open Gaps' })).toBeFocused();
    });
  }
}
