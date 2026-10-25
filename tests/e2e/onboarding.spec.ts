import { expect, test } from '@playwright/test';

// #816: a fresh profile tries a card, answers the exam question, makes a course and
// finishes onboarding inside it, with the exam answer carried into the course.
test('a new learner finishes onboarding inside their first course', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/start$/);

  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  // A missed card comes back, as it does in a study session.
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Do you have an exam coming up?' })).toBeFocused();
  await page.getByRole('radio', { name: /Not yet/ }).press('Space');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await expect(form.getByRole('radio', { name: /Steady retention/ })).toBeChecked();
  await form.getByRole('textbox', { name: 'Course name' }).fill('Biology');
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'How should Lacuna look?' })).toBeVisible();
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Open course' }).click();

  await expect(page).toHaveURL(/#\/course\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lacuna-onboarding'))).toBe('done');

  // Onboarding runs once: entering again goes straight to Today.
  await page.evaluate(() => {
    window.location.hash = '#/welcome';
  });
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
