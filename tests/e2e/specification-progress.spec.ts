import { expect, test, type Page } from '@playwright/test';
import type { Card, CourseRecord } from '../../src/db/types';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../src/specifications/paperFixture.testFixtures';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

async function importScience(page: Page) {
  await enterFreshLacuna(page);
  await openImport(page);
  const now = Date.now();
  const specification = {
    ...paperSpecification,
    points: [
      { id: 'science', ref: 'S', title: 'Science', parentId: null, kind: 'content' },
      ...paperSpecification.points.map((point) => ({ ...point, parentId: 'science' })),
    ],
  };
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Science.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'lacuna-course',
        version: 1,
        assets: [],
        payload: {
          v: 6,
          at: now,
          course: {
            n: 'Supplied science',
            o: 0,
            c: now,
            e: now + 90 * 86400000,
            um: 'open',
            lf: 0,
            specificationRef: paperSpecificationReference,
            specificationData: specification,
          },
          lessons: [
            {
              i: 'science',
              n: 'Mixed science',
              notes: [],
              cards: [
                { id: 'cell', co: 'cells', k: 0, f: 'What is a cell?', b: 'A unit of life.' },
                { id: 'enzyme', co: 'enzymes', k: 0, f: 'What is an enzyme?', b: 'A catalyst.' },
              ],
            },
          ],
          concepts: [
            { id: 'cells', n: 'Cells', specificationPointIds: ['example-science:cells'] },
            {
              id: 'enzymes',
              n: 'Enzymes',
              specificationPointIds: ['example-science:enzymes', 'example-science:unknown'],
            },
          ],
          exams: [
            {
              id: 'final',
              k: 'f',
              n: 'Second paper',
              e: now + 90 * 86400000,
              m: 's',
              specificationPaperId: 'paper-2',
            },
          ],
          questions: [],
          questionSets: [],
          questionSetPracticeNodes: [],
        },
      }),
    ),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page.getByRole('radio', { name: /Exam date/ }).press('Space');
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  const course = (await readAll<CourseRecord>(page, 'courses')).find(
    (row) => row.name === 'Supplied science',
  )!;
  await page.goto(`/#/course/${course.id}/analytics`);
  return course;
}

for (const width of [1440, 390]) {
  test(`supplied point coverage filters and starts bounded practice at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const course = await importScience(page);
    const records = await readAll<Card>(page, 'cards');
    const section = page.getByRole('region', { name: 'Specification coverage' });
    await expect(section).toContainText('2 of 3 supplied leaf points');
    await section
      .locator('summary')
      .filter({ hasText: /^S Science/ })
      .press('Enter');
    await section
      .locator('summary')
      .filter({ hasText: /^3 Practical methods/ })
      .click();
    await expect(section).toContainText('No linked content');
    await section.getByText(/^Author coverage:/).click();
    await expect(section).toContainText('unresolved example-science:unknown');
    await section.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('paper-1');
    await expect(section).toContainText('1 of 2 supplied leaf points');
    await expect(section.locator('summary').filter({ hasText: /^2 Enzymes/ })).toHaveCount(0);
    await section.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('');
    await section
      .locator('summary')
      .filter({ hasText: /^2 Enzymes/ })
      .press('Enter');
    await expect(section.getByRole('list', { name: 'Concepts for 2' })).toContainText('Enzymes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await section.scrollIntoViewIfNeeded();
    const screenshot = testInfo.outputPath(`specification-progress-${width}.png`);
    await section.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach(`specification-progress-${width}`, {
      path: screenshot,
      contentType: 'image/png',
    });
    expect(await readAll<Card>(page, 'cards')).toEqual(records);
    expect(
      (await readAll<CourseRecord>(page, 'courses')).find((row) => row.id === course.id)
        ?.specificationRef,
    ).toEqual(paperSpecificationReference);
    await section.getByRole('button', { name: 'Practise 2', exact: true }).click();
    await expect(page).toHaveURL(/specificationPoint=example-science%3Aenzymes/);
    await expect(page.locator('[data-study-card-id]')).toBeVisible();
    await expect(page.locator('[data-study-card-id]')).toHaveAttribute(
      'data-study-card-id',
      records.find((row) => row.front === 'What is an enzyme?')!.id,
    );
    await expect(page.getByText('What is a cell?', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Space');
    await page.keyboard.press('Y');
    await expect.poll(async () => (await readAll(page, 'reviewHistory')).length).toBe(1);
    // Only the requested Concept receives review evidence; navigation and filters preserve identities.
    const history = await readAll<{ cardId: string }>(page, 'reviewHistory');
    expect(history.map((row) => row.cardId)).toEqual([
      records.find((row) => row.front === 'What is an enzyme?')!.id,
    ]);
    await expect(page.getByRole('heading', { name: 'Scoped practice complete' })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/course/${course.id}/analytics`));
  });
}
