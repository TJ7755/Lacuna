import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`path drawings, Share alignment and analytics empty states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enterFreshLacuna(page);
    await page.getByRole('button', { name: /Exam in .* Welcome to Lacuna/ }).click();
    const drawings = page.locator('[data-path-drawing]');
    await expect(drawings).toHaveCount(2);
    for (const drawing of await drawings.all()) {
      await expect(drawing).toHaveAttribute('aria-hidden', 'true');
      await expect(drawing).toHaveCSS('pointer-events', 'none');
      const bounds = (await drawing.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('path.png') });
    await page
      .getByRole('button', { name: 'Core concepts & rendering', exact: true })
      .press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Core concepts & rendering', exact: true }),
    ).toBeVisible();
    await page.goto('/#/share');
    await expect(page.getByText('Collaborate', { exact: true })).toHaveCount(0);
    const intro = page
      .getByRole('heading', { name: 'Share', exact: true })
      .locator('..')
      .locator('p');
    const exportCopy = page.getByText(/Select a course, then generate a code/);
    await expect(exportCopy).toBeVisible();
    expect(
      Math.abs((await intro.boundingBox())!.x - (await exportCopy.boundingBox())!.x),
    ).toBeLessThan(1);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('share.png') });
    await page.goto('/#/analytics');
    for (const name of ['Course comparison', 'Predicted exam-day score', 'Leech count by course']) {
      const section = page
        .getByRole('heading', { name, exact: true })
        .locator('xpath=ancestor::section[1]');
      await section.scrollIntoViewIfNeeded();
      await expect(section.locator('svg[aria-hidden="true"][viewBox="0 0 88 82"]')).toBeVisible();
    }
    const comparison = page
      .getByRole('heading', { name: 'Course comparison', exact: true })
      .locator('xpath=ancestor::section[1]');
    await comparison.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('comparison.png'),
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
