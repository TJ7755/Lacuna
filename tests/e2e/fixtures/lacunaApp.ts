import { expect, type Page } from '@playwright/test';

export async function chooseScheduledStudy(page: Page) {
  const sheet = page.getByRole('region', { name: 'Session preview' });
  await sheet.getByRole('button', { name: 'Start session' }).first().click();
  await expect(sheet).toBeHidden();
}

export async function enterFreshLacuna(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** Opens Import from Today, or from the navigation drawer on a phone, where Today hides it. */
export async function openImport(page: Page) {
  // Matches Tailwind's sm breakpoint, below which Today hides its Import button.
  if (page.viewportSize()!.width >= 640) {
    await page.locator('main').getByRole('button', { name: 'Import', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('dialog', { name: 'Navigation' })
      .getByRole('link', { name: 'Import' })
      .click();
  }
}

export async function createCourse(page: Page, courseName: string) {
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await form.getByRole('textbox', { name: 'Course name' }).fill(courseName);
  const steadyRetention = form.getByRole('radio', { name: /Steady retention/ });
  await steadyRetention.focus();
  await steadyRetention.press('Space');
  await expect(steadyRetention).toBeChecked();
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Courses' })
      .getByRole('link', { name: courseName, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
}

/** Gives the open lesson a note, so a new course has something to study. */
export async function addLessonNote(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add note' }).click();
  const field = page.getByRole('textbox', { name: 'Title' });
  await field.fill(title);
  await field.press('Control+Enter');
  await expect(field).toBeHidden();
}
