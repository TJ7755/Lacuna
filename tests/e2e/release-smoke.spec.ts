import { expect, test, type Page } from '@playwright/test';

async function openSeededDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Study for the day that counts.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your first course' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

test('first launch reaches the seeded dashboard', async ({ page }) => {
  await openSeededDashboard(page);
  await expect(page.getByText('Welcome to Lacuna', { exact: true }).first()).toBeVisible();
});

test('creates a course with its first lesson', async ({ page }) => {
  await openSeededDashboard(page);
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill('Browser smoke course');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Course sections' })).toBeVisible();
});

test('opens a lesson with persistent course navigation', async ({ page }) => {
  await openSeededDashboard(page);
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Core concepts & rendering' }).click();
  const navigation = page.getByRole('navigation', { name: 'Course sections' });
  await expect(navigation.getByRole('link', { name: 'Path' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Question bank' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Analytics' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('starts a real lesson study interaction', async ({ page }) => {
  await openSeededDashboard(page);
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Study' }).click();
  await page.getByRole('button', { name: /Start:|Continue:/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Show answer/i }).last().click();
  await expect(page.getByRole('button', { name: /Yes|Again/ }).first()).toBeVisible();
});

test('downloads a full backup from recovery settings', async ({ page }) => {
  await openSeededDashboard(page);
  await page.goto('/#/settings#settings-export');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup Complete database' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lacuna-backup-.*\.json$/);
});
