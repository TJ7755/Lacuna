import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('shows a clear completed Simple Learn report on desktop and mobile', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Session report');
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill('What is active recall?');
  await page.getByRole('textbox', { name: 'Back' }).fill('Retrieving information from memory.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose what to study' });
  await sheet.locator('summary').filter({ hasText: 'Simple Learn' }).click();
  await sheet.getByRole('button', { name: 'Start Simple Learn' }).click();
  await page.getByRole('button', { name: /Show answer/i }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’ve reached your goal' })).toBeVisible();
  await expect(page.getByText('Goal reached', { exact: true })).toHaveCount(0);
  await expect(page.getByText('+100 percentage points')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Cards correct in this pass' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByText('Card added.', { exact: true })).toBeHidden();
  await expect.poll(() => page.getByRole('progressbar').locator(':scope > div').evaluate(
    (fill) => fill.getBoundingClientRect().width / fill.parentElement!.getBoundingClientRect().width,
  )).toBeGreaterThan(0.999);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`session-report-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’ve reached your goal' })).toBeHidden();
});
