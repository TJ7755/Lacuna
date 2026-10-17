import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '../../src/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function openSet(page: Page, single = false) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Question-set keyboard');
  const courseId = new URL(page.url()).hash.split('/')[2];
  const answer = (id: string) => ({
    maxMarks: 1,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations: [
      {
        id,
        criterion: 'Controls cell activities.',
        maxMarks: 1,
        dimension: 'knowledge' as const,
        targetConceptIds: [],
      },
    ],
  });
  const content: QuestionSet = {
    id: 'keyboard-set',
    courseId,
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: single
      ? [{ id: 'q1', prompt: 'Describe the nucleus.', parts: [], answer: answer('a1') }]
      : [
          {
            id: 'q1',
            prompt: 'Describe the nucleus.',
            parts: [
              { id: 'part-a', prompt: 'State its role.', subparts: [], answer: answer('a1') },
              {
                id: 'part-b',
                prompt: 'Explain its importance.',
                subparts: [],
                answer: answer('a2'),
              },
            ],
          },
          {
            id: 'q2',
            prompt: 'Choose the membrane property.',
            parts: [],
            answer: {
              ...answer('a3'),
              response: {
                kind: 'multiple-choice',
                selection: 'single',
                options: [
                  { id: 'permeable', content: 'Selectively permeable' },
                  { id: 'impermeable', content: 'Impermeable' },
                ],
                correctOptionIds: ['permeable'],
              },
            },
          },
        ],
  };
  // Seed authored content through the real browser store; all attempt writes use the UI.
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSets', 'readwrite');
          transaction.objectStore('questionSets').add(record);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    {
      ...content,
      contentVersion: 1,
      contentRevisionId: 'keyboard-revision',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  );
  await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
  await expect(page.getByRole('heading', { name: 'Cells', exact: true })).toBeVisible();
}

async function markAndContinue(page: Page, marks: string) {
  const choice = page.getByRole('radio', { name: marks, exact: true });
  await expect(choice).toBeEnabled();
  await choice.focus();
  await choice.press('Space');
  const primary = page.locator('[data-attempt-primary]');
  await expect(primary).toBeEnabled();
  await choice.press('Control+Enter');
}

for (const mode of ['practice', 'paper'] as const) {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`${mode} supports answer and manual-mark progression with ${reducedMotion} motion`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion });
      await openSet(page);
      await page
        .getByRole('group', { name: 'Attempt mode' })
        .getByRole('button', { name: mode === 'paper' ? 'Paper' : 'Practice', exact: true })
        .click();
      await page.setViewportSize({ width: 320, height: 900 });
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
      await expect(answer).toBeFocused();
      await answer.fill('Controls the cell.');
      await answer.press('Enter');
      await answer.press('End');
      await answer.press('Backspace');
      await expect(answer).toHaveValue('Controls the cell.');
      await expect(page.getByText('Controls cell activities.', { exact: true })).toHaveCount(0);
      await answer.press('Control+Enter');
      await expect(page.getByRole('heading', { name: 'Q1 (b)', exact: true })).toBeVisible();
      await expect(answer).toBeFocused();
      await answer.fill('It regulates activity.');
      await answer.press('Control+Enter');
      if (mode === 'practice') {
        await expect(page.getByRole('radio', { name: 'Not marked' })).toBeFocused();
        await markAndContinue(page, '1 / 1');
        await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
        await expect(page.getByRole('radio', { name: 'Not marked' })).toBeFocused();
        await markAndContinue(page, '0 / 1');
      }
      const option = page.getByRole('radio', { name: 'A. Selectively permeable', exact: true });
      await expect(option).toBeFocused();
      await option.press('ArrowDown');
      await expect(page.getByRole('radio', { name: 'B. Impermeable', exact: true })).toBeChecked();
      await option.focus();
      await option.press('Space');
      await option.press('Control+Enter');
      await expect(page.getByRole('radio', { name: 'Not marked' })).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Finish attempt', exact: true }),
      ).toBeDisabled();
      await page.getByRole('radio', { name: 'Not marked' }).press('Control+Enter');
      await expect(page.getByRole('radio', { name: 'Not marked' })).toBeChecked();
      if (mode === 'paper') {
        const activePaper = page.locator('article.qs-paper:not([inert], [inert] *)');
        await expect(activePaper).toHaveCount(1);
        const marks = activePaper.locator('.qs-marking-criterion:not([inert] *)');
        const original = activePaper.locator('.qs-marking-answer:not([inert] *)');
        expect((await marks.boundingBox())!.y).toBeLessThan((await original.boundingBox())!.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          320,
        );
        await page.screenshot({ path: testInfo.outputPath('marking-320.png') });
        await markAndContinue(page, '1 / 1');
        await expect(page.getByRole('button', { name: /criterion 2 of 3/ })).toBeVisible();
        await markAndContinue(page, '0 / 1');
      }
      await expect(page.getByText('1 criterion remaining', { exact: true })).toBeVisible();
      await markAndContinue(page, '1 / 1');
      await expect(page.getByRole('link', { name: 'Back to set →', exact: true })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Back to set', exact: true })).toHaveCount(0);
    });
  }
}

test('a single written part keeps its direct Tab path and blank confirmation explicit', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSet(page, true);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await expect(answer).toBeFocused();
  await expect(page.getByRole('button', { name: 'All parts', exact: true })).toHaveCount(0);
  await answer.press('Tab');
  const submit = page.getByRole('button', { name: 'Submit question', exact: true });
  await expect(submit).toBeFocused();
  await submit.press('Control+Enter');
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await cancel.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Submit unanswered', exact: true })).toBeVisible();
  await cancel.press('Enter');
  await expect(submit).toBeFocused();
  await answer.fill('Controls cell activities.');
  await answer.press('Control+Enter');
  await expect(page.getByRole('radio', { name: 'Not marked' })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Marking criteria' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note', exact: true });
  await note.fill('Keep this draft.');
  await note.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Finish attempt', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeFocused();
});
