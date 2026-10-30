import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`keeps scrolled search usable and restores it after navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await createCourse(page, 'Search continuity', false);
    const coursePath = new URL(page.url()).hash.slice(1);
    const courseId = coursePath.split('/')[2];
    await page.evaluate(
      (courseId) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(['concepts', 'questionSets'], 'readwrite');
            const now = Date.now();
            const techniques = [
              {
                id: 'causal-link',
                prompt:
                  'A potato cylinder loses mass in concentrated sucrose solution. Explain why.',
                criterion:
                  'Links lower external water potential to net water movement out by osmosis.',
              },
              {
                id: 'paired-comparison',
                prompt: 'Cell A has a nucleus; cell B has no nucleus. Compare their nuclei.',
                criterion: 'States that A has a nucleus whereas B does not.',
              },
              {
                id: 'evidence-based-judgement',
                prompt:
                  'Equal samples contain 20, 21 and 80 cells. Judge whether 80 needs checking.',
                criterion: 'Supports checking 80 because it differs greatly from the other counts.',
              },
              {
                id: 'calculation-setup',
                prompt: 'An image is 120 mm long and the cell is 0.03 mm. Set up magnification.',
                criterion: 'Uses magnification = image size / actual size.',
              },
              {
                id: 'substitution',
                prompt:
                  'Use image size / actual size with 120 mm and 0.03 mm. Substitute the values.',
                criterion: 'Substitutes 120 / 0.03.',
              },
              {
                id: 'unit-conversion',
                prompt: 'A cell is 0.12 mm wide. Convert this width to micrometres.',
                criterion: 'Converts 0.12 mm to 120 micrometres.',
              },
              {
                id: 'practical-controls',
                prompt:
                  'Compare osmosis rates in potato cylinders. How should their size be controlled?',
                criterion: 'Cuts the cylinders to the same length and diameter.',
              },
            ];
            for (let index = 0; index < 10; index++) {
              const technique = techniques[index % techniques.length];
              const conceptId = `scroll-concept-${index}`;
              transaction.objectStore('concepts').add({
                id: conceptId,
                courseId,
                scope: 'course',
                scopeKey: `course:${courseId}`,
                name: `Cell knowledge ${index}`,
                provisional: false,
                createdAt: now,
                updatedAt: now,
              });
              transaction.objectStore('questionSets').add({
                id: `scroll-set-${index}`,
                courseId,
                title: `Cell practice ${index}`,
                lessonIds: [],
                assessmentIds: [],
                contentVersion: 1,
                contentRevisionId: `scroll-revision-${index}`,
                createdAt: now,
                updatedAt: now,
                questions: [
                  {
                    id: `question-${index}`,
                    prompt: technique.prompt,
                    parts: [],
                    answer: {
                      maxMarks: 1,
                      response: { kind: 'written' },
                      prerequisiteConceptIds: [],
                      allocations: [
                        {
                          id: `mark-${index}`,
                          criterion: technique.criterion,
                          maxMarks: 1,
                          dimension: 'application',
                          targetConceptIds: [conceptId],
                          techniqueTags: {
                            taxonomyId: 'science-techniques',
                            taxonomyVersion: 1,
                            techniqueIds: [technique.id],
                            provenance: { source: 'author' },
                          },
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
    // Native seeding bypasses Dexie's live-query cache invalidation.
    await page.reload();
    await page.setViewportSize({ width, height: 600 });
    await page.goto(`/#${coursePath}/questions`);
    await page.getByRole('button', { name: 'View mode', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Exam-skill practice', exact: true }),
    ).toBeVisible();
    const main = page.getByRole('main');
    const search = page.getByRole('searchbox', { name: 'Search sets' });
    await search.scrollIntoViewIfNeeded();
    await search.focus();
    const top = await main.evaluate((element) => element.scrollTop);
    expect(top).toBeGreaterThan(100);
    const stable = async () => {
      await expect(search).toBeFocused();
      await expect(search).toBeInViewport();
      // Wait for the restoration frame as well as the synchronous filtering render.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const state = await main.evaluate((element) => ({
        top: element.scrollTop,
        maximum: element.scrollHeight - element.clientHeight,
      }));
      expect(state.top).toBeCloseTo(Math.min(top, state.maximum), 0);
    };
    await stable();
    await search.pressSequentially('cell');
    await stable();
    await expect(page.getByRole('heading', { name: 'Cell practice 0', exact: true })).toBeVisible();
    await search.press('ArrowLeft');
    await search.press('Backspace');
    await stable();
    await expect(search).toHaveValue('cel');
    await search.press('l');
    await expect(search).toHaveValue('cell');
    await stable();
    await search.fill('no matching question set');
    await stable();
    await expect(page.getByRole('heading', { name: 'No matching sets' })).toBeVisible();
    await search.clear();
    await stable();
    await search.pressSequentially('cell');
    await stable();
    await expect(page).toHaveURL(/questions\?q=cell$/);
    await page.screenshot({ path: test.info().outputPath(`search-scroll-${width}.png`) });
    await page.getByRole('link', { name: /Cell practice 0/ }).click();
    await page.getByRole('link', { name: /Back to Questions/ }).click();
    await expect(search).toHaveValue('cell');
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0);
    await page.goBack();
    await expect(page).toHaveURL(/question-sets\/scroll-set-0$/);
    await page.goForward();
    await expect(search).toHaveValue('cell');
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0);
  });
}
