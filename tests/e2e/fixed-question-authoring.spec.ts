import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('old fixed-question routes use the composer and recover its saved draft', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterFreshLacuna(page);
  await createCourse(page, 'Algebra', false);
  const courseId = new URL(page.url()).hash.split('/')[2];
  await page.goto(`/#/course/${courseId}/questions/new`);
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Solve x + 1 = 4.');
  await page.getByRole('textbox', { name: 'Expected answer', exact: true }).fill('3');
  await page.getByRole('textbox', { name: 'Worked explanation' }).fill('Subtract one.');
  await page.getByPlaceholder('Completing the square').fill('Equations');
  await page.getByPlaceholder('A single piece of knowledge').fill('Linear equations');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Create Question', exact: true }).click();
  await expect(page).toHaveURL(/questions$/);
  const sourceId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questions');
          const rows = transaction.objectStore('questions').getAll();
          rows.onsuccess = () => resolve(rows.result.find((row) => row.name === 'Equations').id);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
  const oldRoute = `/#/course/${courseId}/questions/${sourceId}/edit`;
  await page.goto(oldRoute);
  const prompt = page.getByRole('textbox', { name: 'Q1 question', exact: true });
  await expect(prompt).toHaveValue('Solve x + 1 = 4.');
  await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
  await prompt.fill('Solve x + 2 = 5.');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Set details', exact: true }).click();
  const suspension = page.getByRole('switch', { name: 'Suspend this Question' });
  await suspension.click();
  await expect(suspension).toBeChecked();
  await suspension.click();
  await expect(suspension).not.toBeChecked();
  await page.getByRole('button', { name: 'Close set details', exact: true }).click();
  await page.goto(oldRoute);
  await expect(prompt).toHaveValue('Solve x + 2 = 5.');
  await expect(page.locator('[data-route-content]').filter({ has: prompt })).toHaveCSS(
    'opacity',
    '1',
  );
  await page.screenshot({
    path: testInfo.outputPath('fixed-question-composer.png'),
    fullPage: true,
  });
  await prompt.press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  await expect(page.getByText('Solve x + 2 = 5.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(prompt).toHaveValue('Solve x + 2 = 5.');
  const composerRoute = page.url();
  await page.getByRole('button', { name: 'Set details', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('fixed-question-suspension.png'),
    fullPage: true,
  });
  await suspension.click();
  await expect(suspension).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Set details', exact: true }).click();
  await expect(suspension).toBeChecked();
  await suspension.click();
  await expect(suspension).not.toBeChecked();

  // A draft from an older tab must remain recoverable after composer publication.
  await page.evaluate(
    ({ courseId, sourceId }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionConcepts');
          const row = transaction.objectStore('questionConcepts').get(sourceId);
          row.onsuccess = () => {
            localStorage.setItem(
              `lacuna:draft:question:${courseId}:${sourceId}`,
              JSON.stringify({
                timestamp: Date.now(),
                state: {
                  kind: 'fixed',
                  name: 'Recovered equation',
                  newConceptName: '',
                  lessonId: '',
                  targetConceptId: row.result.targetConceptIds[0],
                  prerequisiteConceptIds: [],
                  tags: [],
                  suspended: false,
                  prompt: 'Solve x + 3 = 6.',
                  explanation: 'Subtract three.',
                  answerKind: 'numeric',
                  numericAnswer: { kind: 'exact', value: '3' },
                  workingSource: '',
                  workingFixtures: [],
                  generatorConfig: {},
                },
              }),
            );
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    { courseId, sourceId },
  );
  await page.goto(composerRoute);
  await page.reload();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(
    'Solve x + 3 = 6.',
  );
  await page.getByRole('button', { name: 'Save as new question', exact: true }).click();
  await expect(page).toHaveURL(/questions$/);
  await expect(
    page.getByRole('heading', { name: 'Recovered equation', exact: true }),
  ).toBeVisible();
  await page.goto(oldRoute);
  await expect(prompt).toHaveValue('Solve x + 2 = 5.');
});
