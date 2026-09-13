import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`recall scene keeps its explanation above the graph at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/landing');
    const section = page.getByRole('region', { name: 'Remember it on exam day.' });
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('.exam-projection-copy p')).toHaveCount(0);
    const caption = section.locator('figcaption');
    await expect(caption).toContainText('assuming successful reviews');
    const graph = section.getByRole('img');
    expect((await caption.boundingBox())!.y).toBeLessThan((await graph.boundingBox())!.y);
    await expect(graph.locator('text')).toHaveText(['100%', '0%', 'Today', 'Exam day']);
    expect(await section.locator('output').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const slider = section.getByRole('slider', { name: 'Next review' });
    const before = await section.locator('output').textContent();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('4');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Day 4');
    await expect(section.locator('output')).not.toHaveText(before!);
    await expect(graph).toHaveAccessibleName(/Reviews on days 4 and 10/);
    await expect(section.locator('.exam-curve-reviewed')).toHaveCSS('stroke-dashoffset', '0px');
    await slider.evaluate((node) => node.blur());
    await section.locator('.exam-projection-stage').screenshot({ path: test.info().outputPath(`recall-${width}.png`) });
  });
}
