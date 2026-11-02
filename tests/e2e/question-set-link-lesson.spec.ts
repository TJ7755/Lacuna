import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('links a path question set to the chosen lesson and retains it after reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await enterFreshLacuna(page);
  const courseUrl = await createCourse(page, 'History', false);
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  for (const name of ['League of Nations', 'Hitler’s foreign policy']) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Lesson', exact: true }).click();
    await page.getByRole('textbox', { name: 'Lesson name' }).fill(name);
    await page.getByRole('button', { name: 'Create lesson' }).click();
    await expect(page).toHaveURL(/\/lesson\//);
    await page.getByRole('link', { name: 'Path', exact: true }).click();
  }
  await page.goto(`${courseUrl}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('4 markers');
  await page.keyboard.press('Enter');
  const question = page.getByRole('textbox', { name: 'Q1 question', exact: true });
  await question.fill('Describe two aims of the League of Nations.');
  await page.getByRole('textbox', { name: 'Q1 mark scheme', exact: true }).fill('Keep peace.');
  await question.press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Practice questions', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add practice questions', exact: true });
  const link = editor.getByRole('button', { name: 'Hitler’s foreign policy' });
  await expect(link).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('add-question-set.png') });
  await link.click();
  const lessons = page.getByRole('dialog', { name: 'Hitler’s foreign policy' });
  await expect(lessons.getByRole('button', { name: 'Hitler’s foreign policy' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: test.info().outputPath('link-lesson-picker.png') });
  await lessons.getByRole('button', { name: 'League of Nations', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'League of Nations' })).toBeFocused();
  await editor.getByRole('button', { name: 'Choose a question set', exact: true }).click();
  const sets = page.getByRole('dialog', { name: 'Choose a question set', exact: true });
  await sets.getByRole('radio', { name: /4 markers/ }).check();
  await sets.getByRole('button', { name: 'Use question set', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('linked-question-set.png') });
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  const activity = page.getByRole('button', { name: 'Practice questions: 4 markers', exact: true });
  await expect(activity).toBeVisible();
  await page.reload();
  await activity.click();
  const edit = page.getByRole('dialog', { name: 'Edit practice questions', exact: true });
  await expect(edit.getByRole('button', { name: 'League of Nations' })).toBeVisible();
  await edit.getByRole('button', { name: 'League of Nations' }).click();
  await page
    .getByRole('dialog', { name: 'League of Nations' })
    .getByRole('button', { name: 'Lesson 1', exact: true })
    .click();
  await edit.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(edit).toBeHidden();
  await page.reload();
  await activity.click();
  await expect(edit.getByRole('button', { name: 'Lesson 1' })).toBeVisible();
});
