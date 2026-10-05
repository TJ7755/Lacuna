import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`compact path, Share alignment and analytics empty states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enterFreshLacuna(page);
    await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
    const drawings = page.locator('[data-path-drawing]');
    await expect(drawings).toHaveCount(0);
    const connectors = page.locator('svg.course-connector');
    await expect(connectors).toHaveCount(3);
    expect(await connectors.nth(0).locator('path').getAttribute('d')).not.toBe(
      await connectors.nth(1).locator('path').getAttribute('d'),
    );
    for (const drawing of await connectors.all()) {
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
    await page.getByRole('button', { name: 'Open lesson', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Core concepts & rendering', exact: true }),
    ).toBeVisible();
    await page.goto('/#/share');
    await expect(page.getByText('Collaborate', { exact: true })).toHaveCount(0);
    const heading = page.getByRole('heading', { name: 'Share', exact: true });
    await expect(heading).toBeVisible();
    await expect(heading.locator('xpath=ancestor::header[1]').locator('p')).toHaveCount(0);
    const exportSection = page
      .getByRole('heading', { name: 'Export a course', exact: true })
      .locator('xpath=ancestor::section[1]');
    const exportCopy = page.getByText(/Save a course file to share lessons, cards, question sets and media/);
    await expect(exportCopy).toBeVisible();
    expect(
      Math.abs((await heading.boundingBox())!.x - (await exportSection.boundingBox())!.x),
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
