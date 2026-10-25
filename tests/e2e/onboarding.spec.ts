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
  await page.getByRole('radio', { name: /^Yes/ }).press('Space');
  await expect(page.getByText('Exam date and time', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  // The exam answer from step 2 stands, so the form does not ask again.
  await expect(form.getByRole('radio')).toHaveCount(0);
  await form.getByRole('textbox', { name: 'Course name' }).fill('Biology');
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'How should Lacuna look?' })).toBeVisible();
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Open course' }).click();

  await expect(page).toHaveURL(/#\/course\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lacuna-onboarding'))).toBe('done');
  const assessment = await page.evaluate(
    () =>
      new Promise<{ schedulingMode?: string; examDate?: number }>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result
            .transaction('courseAssessments')
            .objectStore('courseAssessments')
            .getAll();
          all.onsuccess = () => {
            request.result.close();
            resolve(all.result[0]);
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
  expect(assessment).toMatchObject({ schedulingMode: 'exam', examDate: expect.any(Number) });

  // Onboarding runs once: entering again goes straight to Today.
  await page.evaluate(() => {
    window.location.hash = '#/welcome';
  });
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
