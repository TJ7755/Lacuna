import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('generated configuration shares set creation, draft recovery, preview and keyboard publishing', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await createCourse(page, 'Algebra', false);
  const courseId = new URL(page.url()).hash.split('/')[2];
  await page.goto(`/#/course/${courseId}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  const form = page.getByRole('form', { name: 'New question set' });
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Generated quadratics');
  await form.getByLabel('Question form').selectOption('generated');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
  await page.getByLabel('Add a Concept', { exact: true }).fill('Quadratics');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const maximum = page.getByRole('spinbutton', { name: 'Maximum root magnitude' });
  await maximum.fill('3');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(maximum).toHaveValue('3');
  await expect(page.getByLabel('Primary skill practised')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Student preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to composer' }).click();
  await page.screenshot({
    path: testInfo.outputPath('generated-set-composer.png'),
    fullPage: true,
  });
  await maximum.press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const sourceId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questions');
          const rows = transaction.objectStore('questions').getAll();
          rows.onsuccess = () =>
            resolve(rows.result.find((row) => row.name === 'Generated quadratics').id);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
  await page.goto(`/#/course/${courseId}/questions/${sourceId}/edit`);
  await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
  await expect(maximum).toHaveValue('3');
  await maximum.fill('0');
  await maximum.press('Control+Enter');
  await expect(maximum).toHaveAttribute('aria-invalid', 'true');
  await expect(maximum).toBeFocused();
  await maximum.fill('2');
  await maximum.press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  // Old unfinished generated drafts still open the recovery form, then return to shared authoring.
  await page.evaluate(
    async ({ courseId, sourceId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(['questions', 'questionConcepts']);
      const read = (store: string) =>
        new Promise<Record<string, unknown>>((resolve) => {
          const request = transaction.objectStore(store).get(sourceId);
          request.onsuccess = () => resolve(request.result);
        });
      const [source, links] = await Promise.all([read('questions'), read('questionConcepts')]);
      localStorage.setItem(
        `lacuna:draft:question:${courseId}:${sourceId}`,
        JSON.stringify({
          timestamp: Date.now(),
          state: {
            kind: 'generated',
            name: source.name,
            newConceptName: '',
            lessonId: '',
            targetConceptId: (links.targetConceptIds as string[])[0],
            prerequisiteConceptIds: [],
            tags: [],
            suspended: false,
            prompt: '',
            explanation: '',
            answerKind: 'numeric',
            numericAnswer: { kind: 'exact', value: '' },
            workingSource: '',
            workingFixtures: [],
            generatorConfig: { ...(source.generatorConfig as object), maximumRootMagnitude: 4 },
          },
        }),
      );
      database.close();
    },
    { courseId, sourceId },
  );
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(maximum).toHaveValue('4');
  await page.getByRole('button', { name: 'Save Question', exact: true }).click();
  await expect(page).toHaveURL(/questions$/);
  await page.goto(`/#/course/${courseId}/questions/${sourceId}/edit`);
  await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
  await expect(maximum).toHaveValue('4');
});
