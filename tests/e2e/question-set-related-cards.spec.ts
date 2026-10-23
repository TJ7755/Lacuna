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
    prerequisiteConceptIds: [id],
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
          const transaction = database.transaction(['questionSets', 'cards'], 'readwrite');
          transaction.objectStore('questionSets').add(record);
          for (const id of ['a1', 'a2']) {
            transaction.objectStore('cards').add({
              id: `card-${id}`,
              courseId: record.courseId,
              conceptId: id,
              type: 'front_back',
              front: `Related prompt ${id}`,
              back: `Related answer ${id}`,
            });
          }
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

for (const width of [1280, 320]) {
  test(`related cards stay with the current marking part at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSet(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill('Controls the cell.');
    await page.getByRole('textbox', { name: 'Your answer', exact: true }).press('Control+Enter');
    await page
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill('Regulates activity.');
    await page.getByRole('textbox', { name: 'Your answer', exact: true }).press('Control+Enter');
    const trigger = page.getByRole('button', { name: 'Related cards', exact: true });
    await expect(
      page.locator('.qs-header-tools').getByRole('button', { name: 'Related cards' }),
    ).toBeVisible();
    await expect(page.locator('.qs-practice-secondary')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('title', 'Related cards');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const saveBounds = await page
      .getByRole('button', { name: 'Save and finish later' })
      .boundingBox();
    expect(saveBounds!.x + saveBounds!.width).toBeLessThanOrEqual(width);
    const toolbar = testInfo.outputPath(`toolbar-${width}.png`);
    await page.screenshot({ path: toolbar });
    await testInfo.attach('Marking toolbar', { path: toolbar, contentType: 'image/png' });
    await trigger.focus();
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Related cards' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Related answer a1');
    await expect(dialog).not.toContainText('Related answer a2');
    const sheet = testInfo.outputPath(`related-cards-${width}.png`);
    await page.screenshot({ path: sheet });
    await testInfo.attach('Related cards sheet', { path: sheet, contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole('radio', { name: '1 / 1', exact: true }).click();
    await expect(page.locator('[data-attempt-primary]')).toBeEnabled();
    await page.getByRole('radio', { name: '1 / 1', exact: true }).press('Control+Enter');
    await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(dialog).toContainText('Related answer a2');
    await expect(dialog).not.toContainText('Related answer a1');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
  });
}
