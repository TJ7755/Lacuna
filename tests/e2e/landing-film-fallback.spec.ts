import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`landing preview images load at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/landing');

    for (const name of [/Lacuna revision dashboard/, /Gaps class report/]) {
      const image = page.getByRole('img', { name });
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('link', { name: 'Open Gaps' }).focus();
    await expect(page.getByRole('link', { name: 'Open Gaps' })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`previews-${width}.png`) });
  });
}
