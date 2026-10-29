import { expect, test } from '@playwright/test';

test.skip(process.env.LACUNA_BROWSER_SITE !== 'library', 'Run verify:browser -- --library');

for (const width of [1280, 768]) {
  test(`Edexcel GCSE Biology identifies cells before import at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search courses' }).fill('1BI0');
    const cover = page.getByRole('region', { name: 'Courses' }).getByRole('button');
    await expect(cover).toHaveCount(1);
    await cover.click();
    const sheet = page.getByRole('dialog', { name: 'Biology', exact: true });
    await expect(sheet).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath('edexcel-gcse-biology-topics.png') });

    await expect(sheet).toContainText('Pearson Edexcel GCSE · 1BI0');
    await expect(sheet).toContainText('Some board requirements remain outside this selection.');
    const topics = sheet.getByRole('region', { name: 'What you’ll study' });
    await expect(topics.getByText('Animal cell structures', { exact: true })).toBeVisible();
    const plantCells = topics.getByText('Plant cell structures', { exact: true });
    await expect(plantCells).toBeVisible();
    await topics.scrollIntoViewIfNeeded();
    await expect(plantCells).toBeInViewport();
    await page.screenshot({ path: info.outputPath('edexcel-gcse-biology-topic-list.png') });
    await expect(sheet.getByRole('link', { name: 'Open in Lacuna', exact: true })).toHaveAttribute(
      'href',
      'https://getlacuna.app/#/s/f59cf55a906edfede13902ca7bfda358',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
