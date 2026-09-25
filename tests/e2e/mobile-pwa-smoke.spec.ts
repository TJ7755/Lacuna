import { expect, test, type Page } from '@playwright/test';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

async function createMobileCourse(page: Page, courseName: string) {
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill(courseName);
  await page.getByRole('radio', { name: /Steady retention/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
}

async function addCard(page: Page, front: string, back: string) {
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(back);
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await expect(page.getByText(front, { exact: true })).toBeVisible();
}

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('opens course navigation and returns to the dashboard', async ({ page }) => {
  await enterFreshLacuna(page);
  await page.locator('main').getByRole('button', { name: /Exam on .* Welcome to Lacuna/ }).click();
  const sections = page.getByRole('navigation', { name: 'Course sections' });
  await sections.getByRole('link', { name: 'Cards' }).click();
  await expect(page.locator('main[data-route-path$="/cards"]')).toBeVisible();
  await page.getByRole('link', { name: 'All courses' }).click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
});

test('studies a card with touch controls', async ({ page }) => {
  await enterFreshLacuna(page);
  await createMobileCourse(page, 'Mobile study');
  await addCard(page, 'Mobile study front', 'Mobile study back');
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('[data-study-face="front"]').getByText('Mobile study front')).toBeVisible();
  await page.getByRole('button', { name: /Show answer/i }).last().tap();
  await expect(page.locator('[data-study-face="back"]').getByText('Mobile study back')).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).tap();
  await expect(
    page.getByRole('main', { name: 'Study progress' }).getByRole('img', { name: 'Completed', exact: true }),
  ).toBeVisible();
});

test('navigates a visited card library while offline', async ({ page, context }) => {
  await enterFreshLacuna(page);
  await waitForServiceWorkerControl(page);
  await createMobileCourse(page, 'Mobile offline');
  await addCard(page, 'Mobile offline front', 'Mobile offline back');
  await page.getByRole('navigation', { name: 'Course sections' }).getByRole('link', { name: 'Cards' }).click();
  const cards = page.locator('main[data-route-path$="/cards"]');
  await expect(cards.getByText('Mobile offline front', { exact: true }).first()).toBeVisible();
  await context.setOffline(true);
  try {
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.getByRole('navigation', { name: 'Course sections' }).getByRole('link', { name: 'Path' }).click();
    await expect(page.getByRole('heading', { name: 'Lesson 1', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('navigation', { name: 'Course sections' }).getByRole('link', { name: 'Cards' }).click();
    await expect(cards.getByText('Mobile offline front', { exact: true }).first()).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
