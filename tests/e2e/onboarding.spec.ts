import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// #816: setup saves the study target and the marking choice before opening the first course.
test('a new learner corrects setup and opens their first course directly', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/start$/);

  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue setup' })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('onboarding-honest-miss.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Continue setup' }).click();

  await expect(page.getByRole('heading', { name: 'Do you have an exam coming up?' })).toBeFocused();
  await page.getByRole('radio', { name: /^Yes/ }).press('Space');
  const date = page.getByRole('button', { name: 'Exam date and time' });
  await date.click();
  await page.getByRole('textbox', { name: 'Hour' }).fill('16');
  await page.getByRole('textbox', { name: 'Minute' }).fill('35');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const selectedDate = await date.textContent();
  await page.getByRole('button', { name: 'Continue' }).click();

  const markingHeading = page.getByRole('heading', { name: 'Would you like AI marking?' });
  const consent = page.getByRole('checkbox', { name: /read this/ });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(markingHeading).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Yes', exact: true })).toBeChecked();
  await expect(page.getByText(/sends study text to TypeSafe AI/)).toBeVisible();
  await expect(page.getByText(/read this/)).toBeInViewport({ ratio: 1 });
  await expect(consent).not.toBeChecked();
  await expect(next).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('onboarding-ai-marking-default.png'),
    animations: 'disabled',
  });

  await expect(page.getByRole('button', { name: 'Back', exact: true }).locator('svg')).toHaveCSS(
    'width',
    '22px',
  );
  await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Do you have an exam coming up?' })).toBeFocused();
  await expect(page.getByRole('radio', { name: /^Yes/ })).toBeChecked();
  await expect(date).toHaveText(selectedDate!);
  await page.screenshot({
    path: testInfo.outputPath('onboarding-exam-back.png'),
    animations: 'disabled',
  });
  await next.click();
  const expectedExam = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('lacuna-onboarding-target')!).examDate as number,
  );
  await expect(markingHeading).toBeFocused();
  await consent.check();
  await expect(next).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('onboarding-ai-marking-acknowledged.png'),
    animations: 'disabled',
  });
  await next.click();
  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Create my own', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Create my own' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  // The exam answer from step 2 stands, so the form does not ask again.
  await expect(form.getByRole('radio')).toHaveCount(0);
  await form.getByRole('textbox', { name: 'Course name' }).fill('Biology');
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page).toHaveURL(/#\/course\/[^/?]+$/);
  await expect(page.getByRole('button', { name: 'Lesson 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lacuna-onboarding'))).toBe('done');
  await page.screenshot({
    path: testInfo.outputPath('onboarding-course-open.png'),
    animations: 'disabled',
  });
  await page.goto('/#/settings#settings-study');
  await expect(page.getByRole('switch', { name: 'Show advanced details' })).not.toBeChecked();
  await page.goto('/#/settings#settings-jev');
  await expect(page.getByRole('switch', { name: 'Mark my answers automatically' })).toBeChecked();
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
  expect(assessment).toMatchObject({ schedulingMode: 'exam', examDate: expectedExam });

  // Onboarding runs once: entering again goes straight to Today.
  await page.evaluate(() => {
    window.location.hash = '#/welcome';
  });
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('a learner can decline AI marking and open their first imported course', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Not yet/ })).toBeChecked();
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Would you like AI marking?' })).toBeFocused();
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: /read this/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('onboarding-ai-marking-declined.png'),
    animations: 'disabled',
  });
  await next.click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Welcome.lacuna',
    mimeType: 'application/json',
    buffer: readFileSync(new URL('./fixtures/welcome-course.lacuna', import.meta.url)),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page).toHaveURL(/#\/course\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Welcome to Lacuna', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lacuna-onboarding'))).toBe('done');
  await page.goto('/#/settings#settings-jev');
  await expect(
    page.getByRole('switch', { name: 'Mark my answers automatically' }),
  ).not.toBeChecked();
});
