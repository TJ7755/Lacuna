import { expect, test } from '@playwright/test';
import { importWelcomeCourse, openEmptyDashboard, openImport } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1280, height: 844 } });

test('Today keeps class joining under Import at 1280px', async ({ page }) => {
  await openEmptyDashboard(page);
  await importWelcomeCourse(page, { restart: true });
  await expect(page.getByRole('region', { name: 'Today, most urgent first' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join a class', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join a class', exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Today: \d+ reviews? due/)).toBeVisible();
  await openImport(page);
  const join = page.getByRole('button', { name: /Join a class Enter your teacher/ });
  await join.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: /^Class code/ })).toBeFocused();
});

test('finds class entry and corrects invalid or unavailable codes at 1280px', async ({ page }) => {
  await openEmptyDashboard(page);
  await openImport(page);
  await page.getByRole('button', { name: /Join a class Enter your teacher/ }).click();
  const code = page.getByRole('textbox', { name: /^Class code/ });
  await expect(code).toBeFocused();
  await code.fill('short');
  await code.press('Enter');
  await expect(page.getByRole('alert')).toContainText('eight-character class code');
  await page.route('https://relay.getlacuna.app/class-codes/**', (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await code.fill(' k7qm - 4xtp ');
  await code.press('Enter');
  await expect(
    page.getByText('No class uses that code. Check it with your teacher.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Enter another class code' }).click();
  await expect(code).toBeFocused();
  await expect(code).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openImport(page);
  await page.getByRole('button', { name: /Join a class Enter your teacher/ }).click();
  await expect(code).toBeFocused();
  await page.getByRole('button', { name: 'Back to import sources' }).click();
  await expect(page.getByRole('button', { name: /Join a class Enter your teacher/ })).toBeFocused();
});
