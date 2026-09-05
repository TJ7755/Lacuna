import { expect, type Page } from '@playwright/test';

export async function enterFreshLacuna(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'From familiarity to recall' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

export async function createCourse(page: Page, courseName: string) {
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill(courseName);
  await page.getByRole('radio', { name: /Steady retention/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await expect(page.getByRole('link', { name: courseName, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
}
