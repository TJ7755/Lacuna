import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`calendar recall uses a labelled fixed scale at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/landing');
    const chart = page.locator('.calendar-recall');
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator('figcaption')).toHaveText('Example recall');
    await expect(chart.getByRole('img')).toHaveAccessibleName(/80% to 100% recall/);
    await expect(chart.locator('svg text')).toHaveText(['80%', '90%', '100%', 'Today', 'Exam day']);
    await expect(chart.locator('output')).toHaveAccessibleName(/assuming successful reviews/);
    await expect(chart.locator('.calendar-curve-line')).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await chart.screenshot({ path: test.info().outputPath(`recall-${width}.png`) });
  });
}
