import { expect, test, type Page } from '@playwright/test';

async function openSeededDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Study for the day that counts.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

async function expectBalancedDesktopColumns(page: Page, headingName: string, railTitle: string) {
  const heading = page.getByRole('heading', { level: 1, name: headingName });
  const header = heading.locator('xpath=ancestor::header');
  const rail = page.getByText(railTitle, { exact: true }).locator('xpath=ancestor::aside');
  const [headerBounds, railBounds] = await Promise.all([header.boundingBox(), rail.boundingBox()]);

  expect(headerBounds).not.toBeNull();
  expect(railBounds).not.toBeNull();
  expect(headerBounds!.width).toBeGreaterThan(railBounds!.width * 3.5);
}

test('Settings and Help use balanced desktop rails and responsive content', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSeededDashboard(page);

  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Preferences', { exact: true })).toHaveCount(0);
  await expectBalancedDesktopColumns(page, 'Settings', 'Settings groups');

  await page.goto('/#/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await expect(page.getByText('Documentation', { exact: true })).toHaveCount(0);
  await expectBalancedDesktopColumns(page, 'Help', 'On this page');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/#/settings');
  await expect(page.getByLabel('Jump to settings group')).toBeVisible();
  await expect(page.getByText('Settings groups', { exact: true })).toHaveCount(0);

  await page.goto('/#/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
  await expect(page.getByText('On this page', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
