import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '../../src/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function startTranslation(page: Page) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Translation');
  const courseId = new URL(page.url()).hash.split('/')[2];
  const answer = (id: string) => ({
    maxMarks: 3,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations: [
      {
        id,
        criterion: 'An accurate translation.',
        maxMarks: 3,
        dimension: 'application' as const,
        targetConceptIds: [],
      },
    ],
  });
  const content: QuestionSet = {
    id: 'translation-set',
    courseId,
    title: 'Translation',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Translate: The cat sat on the mat',
        parts: [
          { id: 'part-a', prompt: 'The cat', subparts: [], answer: answer('a1') },
          { id: 'part-b', prompt: 'sat on the mat', subparts: [], answer: answer('a2') },
        ],
      },
    ],
  };
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
      contentRevisionId: 'translation-revision',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  );
  await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`attempt layout at ${viewport.width}×${viewport.height}, ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
      await page.emulateMedia({ colorScheme: theme });
      await startTranslation(page);
      await page.setViewportSize(viewport);
      const card = page.locator('article.qs-paper');
      const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
      const primary = page.locator('[data-attempt-primary]');
      const capture = async (state: string) => {
        await expect(card.locator('[inert]')).toHaveCount(0);
        await expect(page.locator('.qs-status')).toBeEmpty();
        await page.screenshot({
          path: testInfo.outputPath(`${state}.png`),
          animations: 'disabled',
        });
      };
      const assertFits = async () => {
        const dimensions = await page.evaluate(() =>
          [document.documentElement, document.body, ...document.querySelectorAll('main')].map(
            (element) => ({
              height: element.clientHeight,
              scrollHeight: element.scrollHeight,
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
            }),
          ),
        );
        for (const row of dimensions) {
          expect(row.scrollHeight).toBeLessThanOrEqual(row.height);
          expect(row.scrollWidth).toBeLessThanOrEqual(row.width);
        }
        await expect(primary).toBeInViewport();
      };
      await expect(card.getByRole('button', { name: 'Next part', exact: true })).toBeVisible();
      await expect(page.getByText('Your answer', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
      await assertFits();
      const header = page.locator('.qs-practice-header');
      const back = header.getByRole('link');
      const finish = header.getByRole('button', { name: 'Save and finish later', exact: true });
      expect((await back.boundingBox())!.y).toBe((await finish.boundingBox())!.y);
      const fieldHeight = (await answer.boundingBox())!.height;
      await answer.fill('A line of working.\n'.repeat(30));
      await expect
        .poll(async () => (await answer.boundingBox())!.height)
        .toBeGreaterThan(fieldHeight);
      await assertFits();
      await answer.fill('Le chat');
      await expect.poll(async () => (await answer.boundingBox())!.height).toBe(fieldHeight);
      await capture('answering');
      await answer.press('Control+Enter');
      await expect(page.getByRole('heading', { name: 'Q1 (b)', exact: true })).toBeVisible();
      await expect(answer).toBeFocused();
      await expect(
        card.getByRole('button', { name: 'Submit question', exact: true }),
      ).toBeVisible();
      await assertFits();
      await answer.fill('s’est assis sur le tapis');
      await answer.press('Control+Enter');
      const award = page.getByRole('radio', { name: '3 / 3', exact: true });
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await capture('marking');
      await award.focus();
      await award.press('Space');
      await expect(award).toBeChecked();
      await expect(primary).toBeEnabled();
      await award.press('Control+Enter');
      await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await award.focus();
      await award.press('Space');
      await expect(award).toBeChecked();
      const finishAttempt = card.getByRole('button', { name: 'Finish attempt', exact: true });
      await expect(finishAttempt).toBeEnabled();
      await finishAttempt.click();
      await expect(page.getByRole('link', { name: 'Back to set', exact: true })).toBeFocused();
      await capture('complete');
      await page.getByRole('button', { name: 'Reflection', exact: true }).click();
      const reflection = page.getByRole('dialog', { name: 'Reflection', exact: true });
      await expect(reflection).toBeVisible();
      const reason = reflection.getByRole('checkbox', {
        name: 'Misread the question',
        exact: true,
      });
      await reason.focus();
      await reason.press('Space');
      await expect(reason).toBeChecked();
      await reflection
        .getByRole('textbox', { name: 'Reflection', exact: true })
        .fill('Read the tense.');
      await reflection.getByRole('button', { name: 'Save reflection', exact: true }).click();
      await expect(
        reflection.getByRole('button', { name: 'Save reflection', exact: true }),
      ).toBeDisabled();
      await expect(reflection).toHaveCSS('opacity', '1');
      await capture('reflection');
      await reflection.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(reflection).toBeHidden();
      await page.reload();
      await page.getByRole('button', { name: 'Reflection', exact: true }).click();
      await expect(
        reflection.getByRole('textbox', { name: 'Reflection', exact: true }),
      ).toHaveValue('Read the tense.');
      await expect(
        reflection.getByRole('checkbox', { name: 'Misread the question', exact: true }),
      ).toBeChecked();
    });
  }
}
