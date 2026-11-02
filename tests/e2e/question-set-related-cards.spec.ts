import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function openSet(page: Page, single = false, manyCards = false) {
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
    ({ record, manyCards }) =>
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
              back: `Related answer ${id}${manyCards ? '\n\nA detailed explanation. '.repeat(100) : ''}`,
            });
          }
          if (manyCards) {
            for (let index = 1; index < 20; index++) {
              transaction.objectStore('cards').add({
                id: `extra-${index}`,
                courseId: record.courseId,
                conceptId: 'a1',
                type: 'front_back',
                front: `Extra related prompt ${index}`,
                back: `Extra related answer ${index}`,
              });
            }
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
      record: {
        ...content,
        contentVersion: 1,
        contentRevisionId: 'keyboard-revision',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      manyCards,
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
    if (width === 1280) {
      const toolbar = testInfo.outputPath('toolbar.png');
      await page.screenshot({ path: toolbar });
      await testInfo.attach('Marking toolbar', { path: toolbar, contentType: 'image/png' });
    }
    await trigger.focus();
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Related cards' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Related prompt a1');
    await expect(dialog).not.toContainText('Related answer a1');
    await dialog.getByRole('button', { name: 'Show answer', exact: true }).click();
    await expect(dialog).toContainText('Related answer a1');
    await expect(dialog).not.toContainText('Related answer a2');
    if (width === 1280) {
      const sheet = testInfo.outputPath('related-cards.png');
      await page.screenshot({ path: sheet });
      await testInfo.attach('Related cards sheet', { path: sheet, contentType: 'image/png' });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole('radio', { name: '1 / 1', exact: true }).click();
    await expect(page.locator('[data-attempt-primary]')).toBeEnabled();
    await page.getByRole('radio', { name: '1 / 1', exact: true }).press('Control+Enter');
    await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(dialog).not.toContainText('Related answer a2');
    await dialog.getByRole('button', { name: 'Show answer', exact: true }).click();
    await expect(dialog).toContainText('Related answer a2');
    await expect(dialog).not.toContainText('Related answer a1');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
  });
}

async function readAttempt(page: Page) {
  return page.evaluate(
    () =>
      new Promise<QuestionSetAttemptRecord>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSetAttempts');
          const read = transaction.objectStore('questionSetAttempts').getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve(read.result[0]);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`consult related cards and return to the same draft (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ reducedMotion });
    await openSet(page, false, true);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('My answer so far.');
    const trigger = page.getByRole('button', { name: 'Use related cards', exact: true });
    await expect(trigger).toHaveAccessibleDescription(
      'Opening these cards records this answer as assisted.',
    );
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Related prompt a1')).toHaveCount(0);
    const collapsed = testInfo.outputPath('help-collapsed.png');
    await page.screenshot({ path: collapsed });
    await testInfo.attach('Help beside the answer', { path: collapsed, contentType: 'image/png' });
    await trigger.focus();
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Related cards' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Related cards' })).toBeFocused();
    await expect(dialog).toContainText('Card 1 of 20');
    await expect(dialog).toContainText('Related prompt a1');
    await expect(dialog).not.toContainText('Related answer a1');
    expect((await readAttempt(page)).assistance).toEqual([
      expect.objectContaining({ nodeId: 'part-a', kind: 'related-knowledge' }),
    ]);
    const reveal = dialog.getByRole('button', { name: 'Show answer', exact: true });
    await reveal.focus();
    await reveal.press('Enter');
    await expect(dialog).toContainText('Related answer a1');
    await expect(dialog.getByRole('button', { name: 'Return to answer' })).toBeInViewport({
      ratio: 1,
    });
    const opened = testInfo.outputPath('help-opened.png');
    await page.screenshot({ path: opened });
    await testInfo.attach('Bounded consultation with a long answer', {
      path: opened,
      contentType: 'image/png',
    });
    await dialog.getByRole('button', { name: 'Next card', exact: true }).click();
    await expect(dialog).toContainText('Card 2 of 20');
    await expect(dialog).not.toContainText('Related answer a1');
    await expect(dialog.getByRole('button', { name: 'Show answer', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Previous card', exact: true }).click();
    await expect(dialog).toContainText('Related prompt a1');
    await expect(dialog).not.toContainText('Related answer a1');
    await dialog.getByRole('button', { name: 'Return to answer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(answer).toHaveValue('My answer so far.');
    const saved = await readAttempt(page);
    expect(saved.assistance).toHaveLength(1);
    expect(saved.responses.find((row) => row.nodeId === 'part-a')?.draft).toEqual({
      kind: 'written',
      text: 'My answer so far.',
    });
    await trigger.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText('Related answer a1');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Next part', exact: true }).click();
    await trigger.click();
    await expect(dialog).toContainText('Related prompt a2');
    await expect(dialog).not.toContainText('Related prompt a1');
    await dialog.getByRole('button', { name: 'Return to answer', exact: true }).click();
    await page.reload();
    await expect(answer).toHaveValue('');
    const restored = await readAttempt(page);
    expect(restored.responses.find((row) => row.nodeId === 'part-a')?.draft).toEqual({
      kind: 'written',
      text: 'My answer so far.',
    });
    expect(restored.assistance.some((event) => event.nodeId === 'part-a')).toBe(true);
    expect(restored.assistance.some((event) => event.nodeId === 'part-b')).toBe(true);
  });
}
