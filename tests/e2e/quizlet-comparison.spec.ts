import { expect, test } from '@playwright/test';

test('serves the comparison and sitemap as public documents', async ({ request, browser }) => {
  const response = await request.get('/compare/quizlet/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Lacuna and Quizlet feature comparison');
  expect(html).toContain('https://getlacuna.app/compare/quizlet/');
  expect(html).not.toContain('Prototype variants');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('<loc>https://getlacuna.app/compare/quizlet/</loc>');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(response.url());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Remember it on exam day.');
  await expect(page.getByRole('table')).toBeVisible();
  await context.close();
});

test('hydrates the real flashcards, scheduling and teacher sharing without starting the app', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/compare/quizlet/');
  await page.getByRole('combobox', { name: 'Example exam date' }).selectOption('7');
  await expect(page.getByRole('img', { name: /Predicted recall/ })).toHaveAttribute(
    'aria-label',
    /in 7 days/,
  );
  const practice = page.locator('#practice');
  await practice.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await expect(practice.locator('[data-study-face="back"]')).toContainText('biological catalyst');
  await practice.getByRole('button', { name: 'Type an answer', exact: true }).click();
  await practice.getByLabel('Your answer').fill('active site');
  await practice.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(practice.getByRole('button', { name: 'Hide answer' })).toBeVisible();
  await page.getByRole('button', { name: 'Course updates' }).click();
  await expect(page.getByText('Republish to the same link')).toBeVisible();
  await page.getByRole('button', { name: 'Enlarge your course screenshot' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(errors).toEqual([]);
});

test('keeps the mobile comparison usable with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/compare/quizlet/');
  await page.getByRole('button', { name: 'Moving over', exact: true }).click();
  await page.getByRole('button', { name: 'Bringing your sets', exact: false }).click();
  await expect(page.getByRole('link', { name: 'Quizlet source', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Course updates' }).click();
  await expect(
    page.getByText('Existing review history is preserved', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
