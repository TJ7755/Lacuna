import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { SCIENCE_TECHNIQUES } from '../../src/questions/techniqueTags';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

const examples = 'docs/question-bank/examples';
const density = 'Set up a calculation';
const source = {
  title: 'Original browser test content',
  reference: 'Synthetic public UI fixture',
  author: 'Lacuna contributors',
  licence: 'CC0-1.0',
};
const allocation = (id: string, concept: string, maxMarks = 2) => ({
  id,
  criterion: 'Explain the relationship using the evidence.',
  maxMarks,
  dimension: 'application',
  targetConceptIds: [concept],
  techniqueTags: {
    taxonomyId: 'science-techniques',
    taxonomyVersion: 1,
    techniqueIds: ['paired-comparison'],
    provenance: { source: 'author' },
  },
});
const mixedBank = {
  format: 'lacuna-question-bank',
  schemaVersion: 1,
  bankId: 'browser-mixed',
  courseCode: 'BROWSER-DEMO',
  bankVersion: 1,
  concepts: [
    { id: 'reasoning', name: 'Explain a relationship' },
    { id: 'choice', name: 'Choose evidence' },
  ],
  families: [],
  sets: [
    {
      id: 'mixed',
      title: 'Evidence and explanation',
      source,
      blueprint: {
        skill: 'Use evidence',
        type: 'written',
        difficulty: 'introductory',
        context: 'A laboratory investigation',
      },
      questions: [
        {
          id: 'q1',
          prompt:
            'Compare the measurements before drawing a conclusion. '.repeat(8) +
            '\n\n$\\rho = m / V$\n\n| Sample | Mass / g | Volume / cm³ |\n| --- | --- | --- |\n| A | 24 | 8 |\n| B | 36 | 12 |',
          parts: [
            {
              id: 'a',
              prompt: 'Explain why both samples have the same density.',
              subparts: [],
              answer: {
                maxMarks: 2,
                response: { kind: 'written' },
                prerequisiteConceptIds: [],
                allocations: [allocation('reason', 'reasoning')],
              },
            },
            {
              id: 'b',
              prompt: 'Choose the conclusion supported by the measurements.',
              subparts: [],
              answer: {
                maxMarks: 1,
                prerequisiteConceptIds: [],
                response: {
                  kind: 'multiple-choice',
                  selection: 'single',
                  options: [
                    {
                      id: 'same',
                      content:
                        'The samples have the same density because the ratio $m/V$ is equal.',
                    },
                    {
                      id: 'different',
                      content:
                        'The larger mass always gives a greater density regardless of volume.',
                    },
                  ],
                  correctOptionIds: ['same'],
                },
                allocations: [allocation('choice', 'choice', 1)],
              },
            },
          ],
        },
      ],
    },
  ],
};

async function openLibrary(page: Page) {
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterFreshLacuna(page);
  await createCourse(page, 'Application practice');
  const courseId = new URL(page.url()).hash.split('/')[2];
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await page.setViewportSize(viewport);
  await page.goto(`/#/course/${courseId}/questions`);
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  return `/#/course/${courseId}/questions`;
}

async function upload(page: Page, value: unknown, name = 'question-bank.json') {
  await page.getByLabel('Question bank JSON').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  });
}

async function importExample(page: Page, name: string) {
  const bank = JSON.parse(await readFile(`${examples}/${name}.json`, 'utf8'));
  // Classify this synthetic fixture explicitly; importing an untagged bank never infers skills.
  for (const set of [
    ...bank.sets,
    ...bank.families.map((family: { template: unknown }) => family.template),
  ]) {
    for (const question of set.questions) {
      for (const answer of [
        question.answer,
        ...question.parts.map((part: { answer: unknown }) => part.answer),
      ]) {
        for (const mark of answer?.allocations ?? [])
          mark.techniqueTags = {
            taxonomyId: 'science-techniques',
            taxonomyVersion: 1,
            techniqueIds: ['calculation-setup'],
            provenance: { source: 'author' },
          };
      }
    }
  }
  await upload(page, bank);
  await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toBeVisible();
}

async function fits(page: Page) {
  const widths = await page.evaluate(() =>
    [document.documentElement, document.body, ...document.querySelectorAll('main')].map(
      (element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }),
    ),
  );
  for (const row of widths) expect(row.scrollWidth).toBeLessThanOrEqual(row.width + 1);
  const primary = page.locator('[data-attempt-primary]');
  await primary.focus();
  await primary.scrollIntoViewIfNeeded();
  await expect(primary).toBeInViewport();
  const box = await primary.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height - (page.viewportSize()!.width < 640 ? 60 : 0),
  );
}

async function capture(page: Page, info: TestInfo, state: string) {
  await page.screenshot({ path: info.outputPath(`${state}.png`), animations: 'disabled' });
}

async function award(page: Page, marks: string) {
  const radio = page.getByRole('radio', { name: marks, exact: true });
  await radio.focus();
  await radio.press('Space');
  await expect(radio).toBeChecked();
}

for (const width of [1280, 390]) {
  test.describe(`Exam-skill practice at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 800 } });

    test('keeps the exam-skill chooser inside the library and usable from the keyboard', async ({
      page,
    }, info) => {
      await openLibrary(page);
      const concepts = Array.from({ length: 7 }, (_, index) => ({
        id: `long-skill-${index}`,
        name: `Apply evidence in unfamiliar context ${index}: distinguish the relationship between measurements, their limitations and the assumptions needed for a justified conclusion`,
      }));
      await upload(page, {
        format: 'lacuna-question-bank',
        schemaVersion: 1,
        bankId: 'long-skill-demo',
        bankVersion: 1,
        courseCode: 'DEMO',
        concepts,
        families: [],
        sets: concepts.map((concept, index) => ({
          id: `set-${index}`,
          title: `Evidence ${index}`,
          source,
          blueprint: {
            skill: concept.name,
            type: 'written',
            difficulty: 'standard',
            context: 'Public browser fixture',
          },
          questions: [
            {
              id: `q-${index}`,
              prompt: 'Use the evidence to justify a conclusion.',
              parts: [],
              answer: {
                maxMarks: 1,
                response: { kind: 'written' },
                prerequisiteConceptIds: [],
                allocations: [
                  {
                    ...allocation(`a-${index}`, concept.id, 1),
                    techniqueTags: {
                      taxonomyId: 'science-techniques',
                      taxonomyVersion: 1,
                      techniqueIds: [SCIENCE_TECHNIQUES[index].id],
                      provenance: { source: 'author' },
                    },
                  },
                ],
              },
            },
          ],
        })),
      });
      const chooser = page.getByRole('combobox', { name: 'All skills', exact: true });
      await expect(chooser).toBeVisible();
      await chooser.scrollIntoViewIfNeeded();
      const bounds = await chooser.boundingBox();
      const main = await page.locator('main').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(main!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(main!.x + main!.width);
      const practise = page.getByRole('button', { name: 'Practise selected skill', exact: true });
      await capture(page, info, 'skill-chooser-alignment');
      const actionBounds = await practise.boundingBox();
      expect(Math.abs(bounds!.height - actionBounds!.height)).toBeLessThanOrEqual(1);
      if (width === 1280) {
        expect(Math.abs(bounds!.y - actionBounds!.y)).toBeLessThanOrEqual(1);
      } else {
        expect(actionBounds!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
        expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(main!.x + main!.width);
      }
      await expect(chooser).toHaveCSS('appearance', 'none');
      await expect(practise).toBeDisabled();
      await chooser.focus();
      // Native typeahead works without a platform popup in headless macOS Chromium.
      await chooser.press('c');
      await expect(chooser).not.toHaveValue('');
      await expect(chooser).toBeFocused();
      await capture(page, info, 'skills-library');
      await chooser.press('Tab');
      await expect(practise).toBeFocused();
      await practise.press('Enter');
      await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
    });

    test('imports a public multipart bank, retains saved work on reimport and requires explicit familiar practice', async ({
      page,
    }, info) => {
      const library = await openLibrary(page);
      await importExample(page, 'static-multipart');
      await upload(page, '{ invalid JSON');
      await expect(page.getByRole('alert')).toContainText('question-bank.json is retained');
      await page.getByRole('button', { name: 'Retry import', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Saved content and attempts are unchanged',
      );
      await page.getByText('Validation details', { exact: true }).click();
      await expect(page.locator('details pre')).toBeVisible();
      await expect(
        page.getByRole('button', { name: `Practise ${density}`, exact: true }),
      ).toBeVisible();
      await importExample(page, 'static-multipart');
      await expect(
        page.getByRole('button', { name: `Practise ${density}`, exact: true }),
      ).toHaveCount(1);
      await page.getByRole('button', { name: `Practise ${density}`, exact: true }).click();
      const answer = page.getByRole('textbox', { name: 'Your working and answer', exact: true });
      await expect(answer).toBeFocused();
      const attemptUrl = page.url();
      await answer.fill('24 / 8 = 3 g/cm³');
      await fits(page);
      await capture(page, info, 'calculation');
      await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
      await expect(page).toHaveURL(/\/questions$/);
      await importExample(page, 'static-multipart');
      await page.getByRole('button', { name: 'Resume question practice', exact: true }).click();
      await expect(page).toHaveURL(attemptUrl);
      await expect(answer).toHaveValue('24 / 8 = 3 g/cm³');
      await page.reload();
      await expect(answer).toHaveValue('24 / 8 = 3 g/cm³');
      await answer.press('Control+Enter');
      await expect(page.getByRole('heading', { name: 'Q1 (b)', exact: true })).toBeVisible();
      await answer.fill('6 g');
      await answer.press('Control+Enter');
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await award(page, '1 / 1');
      await page.locator('[data-attempt-primary]').click();
      await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await award(page, '0 / 1');
      await page.getByRole('button', { name: 'Finish attempt', exact: true }).click();
      await expect(page.getByRole('link', { name: /Back to/ }).last()).toBeVisible();
      await capture(page, info, 'multipart-complete');
      await page.goto(library);
      await page.getByRole('button', { name: `Practise ${density}`, exact: true }).click();
      await expect(page.getByText(/No unseen questions remain/)).toBeVisible();
      await page.getByRole('button', { name: 'Practise familiar questions', exact: true }).click();
      await expect(page.locator('article.qs-paper')).toBeVisible();
      await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
    });

    test('presents every finite family variant once before offering familiar questions', async ({
      page,
    }, info) => {
      await openLibrary(page);
      await importExample(page, 'numeric-family');
      const prompts = new Set<string>();
      for (let index = 0; index < 6; index++) {
        await page.getByRole('button', { name: `Practise ${density}`, exact: true }).click();
        await expect(page.locator('article.qs-paper')).toBeVisible();
        const prompt = await page.locator('article.qs-paper').innerText();
        expect(prompts.has(prompt)).toBe(false);
        prompts.add(prompt);
        await fits(page);
        if (index === 0) await capture(page, info, 'numeric-family');
        await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
      }
      await page.getByRole('button', { name: `Practise ${density}`, exact: true }).click();
      await expect(page.getByText(/No unseen questions remain/)).toBeVisible();
      await page.getByRole('button', { name: 'Practise familiar questions', exact: true }).click();
      await expect(page.locator('article.qs-paper')).toBeVisible();
      await page.reload();
      await expect(page.locator('article.qs-paper')).toBeVisible();
    });

    test('handles long written and native choice content, partial marks and immutable corrections', async ({
      page,
    }, info) => {
      const library = await openLibrary(page);
      await upload(page, mixedBank);
      await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toBeVisible();
      await page
        .getByRole('button', { name: 'Practise Compare like with like', exact: true })
        .click();
      const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
      await expect(answer).toBeFocused();
      await expect(page.locator('article table')).toBeVisible();
      await expect(page.locator('article .katex').first()).toBeVisible();
      await answer.fill('The masses are the same.');
      await fits(page);
      await capture(page, info, 'long-written');
      await answer.press('Control+Enter');
      const option = page.getByRole('radio', { name: /larger mass always/ });
      await option.focus();
      await option.press('Space');
      await expect(option).toBeChecked();
      await fits(page);
      await capture(page, info, 'native-choice');
      await option.press('Control+Enter');
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Correction', exact: true }).click();
      const correction = page.getByRole('dialog', { name: 'Correction', exact: true });
      await correction
        .getByRole('textbox', { name: 'Correction', exact: true })
        .fill('Both mass-to-volume ratios equal 3 g/cm³.');
      await correction.getByRole('button', { name: 'Save correction', exact: true }).click();
      await expect(
        correction.getByRole('button', { name: 'Save correction', exact: true }),
      ).toBeDisabled();
      await correction.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(correction).toBeHidden();
      await award(page, '1 / 2');
      await page.locator('[data-attempt-primary]').click();
      await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await award(page, '0 / 1');
      await fits(page);
      await capture(page, info, 'partial-marking');
      await page.getByRole('button', { name: 'Finish attempt', exact: true }).click();
      await expect(page.locator('[data-attempt-complete]')).toBeVisible();
      await page.reload();
      await expect(page.locator('.qs-result')).toContainText('1 / 3');
      await page.goto(library);
      await expect(page.getByRole('img', { name: 'Latest score 33%', exact: true })).toBeVisible();
    });
  });
}

for (const width of [1280, 390]) {
  test(`imports a public bank from a locked published course at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await enterFreshLacuna(page);
    await createCourse(page, 'Published Biology');
    const courseId = new URL(page.url()).hash.split('/')[2];
    const lineageId = 'browser-published-biology';
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });

    await page.evaluate(
      async ({ courseId, lineageId }) => {
        const connection = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = connection.transaction(
              ['courses', 'lineageIdMappings'],
              'readwrite',
            );
            const courses = transaction.objectStore('courses');
            const request = courses.get(courseId);
            request.onsuccess = () => {
              if (!request.result) {
                transaction.abort();
                reject(new Error('Synthetic course was not saved.'));
                return;
              }
              courses.put({
                ...request.result,
                lessonViewMode: 'study',
                distributedCopy: {
                  lineageId,
                  revision: 1,
                  locked: true,
                  autoAcceptUpdates: false,
                },
              });
              transaction.objectStore('lineageIdMappings').put({
                id: lineageId,
                courseId,
                lessonIds: [],
                noteIds: [],
                cardIds: [],
                conceptIds: [],
                questionIds: [],
                questionSetIds: [],
                questionSetRevisions: {},
              });
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          });
        } finally {
          connection.close();
        }
      },
      { courseId, lineageId },
    );

    await page.reload();
    await page.goto(`/#/course/${courseId}/questions`);
    await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import question bank' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New question set' })).toHaveCount(0);
    await importExample(page, 'static-multipart');
    await expect(page.getByRole('button', { name: 'Export physics-density' })).toBeVisible();
    await capture(page, info, `locked-bank-controls-${width}`);

    const retainedLineage = await page.evaluate(
      async ({ courseId, lineageId }) => {
        const connection = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<boolean>((resolve, reject) => {
            const transaction = connection.transaction(['courses', 'lineageIdMappings']);
            const courseRequest = transaction.objectStore('courses').get(courseId);
            const mappingRequest = transaction.objectStore('lineageIdMappings').get(lineageId);
            transaction.oncomplete = () =>
              resolve(
                courseRequest.result?.distributedCopy?.locked === true &&
                  courseRequest.result?.distributedCopy?.lineageId === lineageId &&
                  mappingRequest.result?.courseId === courseId,
              );
            transaction.onerror = () => reject(transaction.error);
          });
        } finally {
          connection.close();
        }
      },
      { courseId, lineageId },
    );
    expect(retainedLineage).toBe(true);
  });
}
