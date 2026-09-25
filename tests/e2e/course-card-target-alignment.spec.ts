import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1280]) {
  test(`course calendar aligns optically with the date at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const date = page.locator('button time').first();
    await expect(date).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const offset = await date.evaluate((element) => {
      const body = element.parentElement!.querySelector('svg rect')!.getBoundingClientRect();
      // Measure the font's visible ink rather than the surrounding line box.
      const marker = document.createElement('span');
      marker.style.cssText = 'display:inline-block;width:0;height:0';
      element.append(marker);
      const baseline = marker.getBoundingClientRect().top;
      marker.remove();
      const style = getComputedStyle(element);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontSize} ${style.fontFamily}`;
      const ink = context.measureText(element.textContent!);
      const textCentre =
        baseline + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;
      return Math.abs(body.y + body.height / 2 - textCentre);
    });
    expect(offset).toBeLessThanOrEqual(0.5);
  });
}
