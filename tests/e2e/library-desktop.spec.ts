import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2, colorScheme: 'light' });

async function capture(page: Page, name: string) {
  await page.mouse.move(0, 0);
  await page.getByRole('main').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.evaluate(() => document.fonts.ready);
  // Let the shared route and tab springs settle before recording the resting surface.
  await page.waitForTimeout(750);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: 'disabled' });
}

test('keeps creation, search, drafts and practice reachable across the desktop libraries', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
  await enterFreshLacuna(page);
  await createCourse(page, 'Biology');
  const coursePath = new URL(page.url()).hash.slice(1);
  const courseId = coursePath.split('/')[2];
  await page.goto(`/#${coursePath}/cards`);
  await expect(page.getByText('This course has no cards yet.')).toBeVisible();
  await capture(page, 'cards-empty');
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  for (const [front, back] of [
    ['What is the function of the nucleus?', 'It contains genetic material.'],
    ['What controls movement into and out of a cell?', 'The cell membrane.'],
    ['Where does aerobic respiration take place?', 'In the mitochondria.'],
  ]) {
    await page.getByRole('textbox', { name: 'Front', exact: true }).fill(front);
    await page.getByRole('textbox', { name: 'Back', exact: true }).fill(back);
    await page.getByRole('button', { name: 'Save & add another' }).click();
    await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toHaveValue('');
  }
  await page.goto(`/#${coursePath}/cards`);
  await expect(page.getByText('3 cards', { exact: true })).toBeVisible();
  await capture(page, 'cards-populated');
  const cardSearch = page.getByRole('searchbox', { name: 'Search all cards' });
  await cardSearch.fill('nucleus');
  await expect(page.locator('[data-card-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'New 3', exact: true }).click();
  await cardSearch.fill('no matching card');
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(cardSearch).toHaveValue('');
  await expect(page.getByRole('button', { name: 'New 3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('[data-card-id]')).toHaveCount(3);

  await page.goto(`/#${coursePath}/questions`);
  await expect(page.getByRole('heading', { name: 'No question sets yet' })).toBeVisible();
  await capture(page, 'questions-empty');
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Cell transport');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Q1 question', exact: true })).toBeFocused();
  await page.goto(`/#${coursePath}/questions`);
  await expect(page.getByRole('heading', { name: 'Cell transport', exact: true })).toBeVisible();

  await page.evaluate(
    (courseId) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSets', 'readwrite');
          for (const [index, title] of ['Cell structure', 'Specialised cells'].entries()) {
            transaction.objectStore('questionSets').add({
              id: `library-set-${index}`,
              courseId,
              title,
              lessonIds: [],
              assessmentIds: [],
              contentVersion: 1,
              contentRevisionId: `library-revision-${index}`,
              createdAt: 1,
              updatedAt: 1,
              questions: [
                {
                  id: `question-${index}`,
                  prompt: 'Explain how the structure supports its function.',
                  parts: [],
                  answer: {
                    maxMarks: 1,
                    response: { kind: 'written' },
                    prerequisiteConceptIds: [],
                    allocations: [
                      {
                        id: `mark-${index}`,
                        criterion: 'Relates structure to function.',
                        maxMarks: 1,
                        dimension: 'knowledge',
                        targetConceptIds: [],
                      },
                    ],
                  },
                },
              ],
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
    courseId,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Specialised cells', exact: true })).toBeVisible();
  await capture(page, 'questions-populated');
  const setSearch = page.getByRole('searchbox', { name: 'Search sets' });
  await setSearch.fill('transport');
  await expect(page.getByRole('heading', { name: 'Cell transport', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cell structure', exact: true })).toBeHidden();
  await setSearch.fill('no matching set');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(setSearch).toHaveValue('');
  await page.getByRole('button', { name: 'View mode', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cell transport', exact: true })).toBeHidden();
  await capture(page, 'questions-practice');
  await page.getByRole('button', { name: 'Attempt', exact: true }).first().click();
  await expect(page).toHaveURL(/question-sets\/library-set-\d\/attempts\//);
  await expect(
    page.getByText('Explain how the structure supports its function.', { exact: true }),
  ).toBeVisible();
});
