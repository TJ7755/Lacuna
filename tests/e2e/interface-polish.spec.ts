import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`compact lesson list, Share alignment and analytics empty states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enterFreshLacuna(page);
    await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
    const drawings = page.locator('[data-path-drawing]');
    await expect(drawings).toHaveCount(0);
    const lessons = page.getByRole('list', { name: 'Course path' });
    await expect(lessons).toBeVisible();
    for (const row of await lessons.getByRole('listitem').all()) {
      const bounds = (await row.boundingBox())!;
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
    const heading = page.getByRole('heading', { name: 'Share', exact: true });
    await expect(heading).toBeVisible();
    // The header holds the title and the course being shared, nothing descriptive.
    await expect(heading.locator('xpath=ancestor::header[1]')).toHaveText('ShareWelcome to Lacuna');
    const linkSection = page
      .getByRole('heading', { name: 'Share link', exact: true })
      .locator('xpath=ancestor::section[1]');
    await expect(linkSection).toBeVisible();
    expect(
      Math.abs((await heading.boundingBox())!.x - (await linkSection.boundingBox())!.x),
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
