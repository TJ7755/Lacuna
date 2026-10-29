import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { CourseRecord } from '../../src/db/types';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../src/specifications/paperFixture.testFixtures';
import { chooseScheduledStudy, enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

const specification = {
  ...paperSpecification,
  routes: [...paperSpecification.routes, { id: 'practical', name: 'Practical route' }],
};

async function importCourse(page: Page, mode: 'selected' | 'unresolved' | 'missing' = 'selected') {
  await openImport(page);
  const date = Date.now() + 90 * 86400000;
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
          at: Date.now(),
          course: {
            n: `Supplied science ${mode}`,
            o: 0,
            c: Date.now(),
            e: date,
            um: 'open',
            lf: 0,
            examBoard: 'My board',
            specification: 'My fallback syllabus',
            specificationRef:
              mode === 'selected'
                ? paperSpecificationReference
                : { specificationId: specification.id },
            ...(mode === 'missing'
              ? {}
              : { specificationData: mode === 'unresolved' ? paperSpecification : specification }),
          },
          lessons: [
            {
              i: 'science',
              n: 'Mixed science',
              notes: [],
              cards: [
                { id: 'cells-card', co: 'cells', k: 0, f: 'What is a cell?', b: 'A unit of life.' },
                {
                  id: 'enzymes-card',
                  co: 'enzymes',
                  k: 0,
                  f: 'What is an enzyme?',
                  b: 'A catalyst.',
                },
              ],
            },
          ],
          concepts: [
            { id: 'cells', n: 'Cells', specificationPointIds: ['example-science:cells'] },
            {
              id: 'enzymes',
              n: 'Enzymes',
              specificationPointIds: [
                'example-science:enzymes',
                'example-science:unknown',
                'other-spec:point',
              ],
            },
          ],
          ...(mode === 'selected'
            ? {
                exams: [
                  {
                    id: 'final',
                    k: 'f',
                    n: 'Second paper',
                    e: date,
                    m: 's',
                    specificationPaperId: 'paper-2',
                  },
                ],
              }
            : {}),
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
    (entry) => entry.name === `Supplied science ${mode}`,
  )!;
  expect(course).toBeDefined();
  return course;
}

async function openDetails(page: Page, courseId: string) {
  await page.goto(`/#/course/${courseId}/settings`);
  await page.getByRole('button', { name: /^Course details/ }).click();
}

async function evidence(page: Page) {
  return Object.fromEntries(
    await Promise.all(
      ['cards', 'concepts', 'reviewHistory', 'lessons', 'courseAssessments'].map(async (table) => [
        table,
        await readAll(page, table),
      ]),
    ),
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[aria-label="Notifications"] > *')).toHaveCount(0, {
    timeout: 10_000,
  });
  const path = testInfo.outputPath(`${name}.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, animations: 'disabled', fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const width of [1440, 390]) {
  test(`previews, cancels and saves selection without losing learner evidence at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const course = await importCourse(page);
    await page.goto(`/#/course/${course.id}`);
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    await expect(page.locator('[data-study-card-id]')).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('Y');
    await expect.poll(async () => (await readAll(page, 'reviewHistory')).length).toBe(1);

    await page.goto(`/#/course/${course.id}/settings`);
    await page.getByRole('button', { name: 'Add checkpoint', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('My school test');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Edit My school test', exact: true }),
    ).toBeVisible();
    const before = await evidence(page);
    await page.getByRole('button', { name: /^Course details/ }).click();
    const section = page.getByRole('region', { name: 'Supplied specification', exact: true });
    await expect(section.getByRole('heading', { name: 'Synthetic science' })).toBeVisible();
    await expect(
      section.getByText('AQA · GCSE · EXAMPLE · First exam 2027', { exact: true }),
    ).toBeVisible();
    const about = section.getByLabel('About this specification', { exact: true });
    await about.click();
    await expect(section.getByText('Edition: 1.', { exact: true })).toBeVisible();
    await about.click();
    await section.getByRole('button', { name: 'Change selection', exact: true }).press('Enter');
    const tier = section.getByRole('combobox', { name: 'Tier', exact: true });
    await expect(tier).toBeFocused();
    await tier.selectOption('foundation');
    const preview = section.getByRole('region', { name: 'Selection consequences' });
    await expect(
      preview.getByText('3 unsupported Concept point links. All links are retained.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      preview.getByText('Second paper: 0 points added, 1 removed from coverage.', { exact: true }),
    ).toBeVisible();
    await expect(preview.getByText(/other specification/)).toBeVisible();
    await section.getByRole('checkbox', { name: 'Practical route', exact: true }).check();
    await section.getByRole('checkbox', { name: 'Written papers', exact: true }).uncheck();
    await expect(
      preview.getByText(
        'Second paper: Cannot save: The paper does not apply to this specification selection.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Save selection', exact: true }),
    ).toBeDisabled();
    await section.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `blocked-selection-${width}`);
    await page.keyboard.press('Escape');
    await expect(
      section.getByRole('button', { name: 'Change selection', exact: true }),
    ).toBeFocused();
    expect(await evidence(page)).toEqual(before);
    expect((await readAll<CourseRecord>(page, 'courses'))[0].specificationRef).toEqual(
      paperSpecificationReference,
    );

    await section.getByRole('button', { name: 'Change selection', exact: true }).click();
    await tier.selectOption('foundation');
    await section.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `selection-preview-${width}`);
    await section.getByRole('button', { name: 'Save selection', exact: true }).click();
    await expect(
      section.getByRole('button', { name: 'Change selection', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /^Course details/ }).click();
    await expect(section.getByText('Tier · Foundation', { exact: true })).toBeVisible();
    await expect(section.getByText('Routes · Written papers', { exact: true })).toBeVisible();
    expect(await evidence(page)).toEqual(before);
    const saved = (await readAll<CourseRecord>(page, 'courses'))[0];
    expect(saved.specificationRef).toEqual({ ...paperSpecificationReference, tier: 'foundation' });
    expect(saved.specificationData).toEqual(specification);
    expect(saved.examBoard).toBe('My board');
    expect(saved.specification).toBe('My fallback syllabus');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await section.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `saved-selection-${width}`);
  });
}

test('offers supported defaults explicitly and keeps Custom and missing metadata recoverable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const course = await importCourse(page, 'unresolved');
  await openDetails(page, course.id);
  const section = page.getByRole('region', { name: 'Supplied specification', exact: true });
  await expect(section.getByText('Choose a tier.', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Change selection', exact: true }).click();
  await expect(
    section.getByRole('checkbox', { name: 'Written papers', exact: true }),
  ).toBeChecked();
  await expect(section.getByRole('combobox', { name: 'Tier', exact: true })).toHaveValue('');
  await expect(section.getByRole('button', { name: 'Save selection', exact: true })).toBeDisabled();
  await section.getByRole('combobox', { name: 'Tier', exact: true }).selectOption('higher');
  await section.getByRole('button', { name: 'Save selection', exact: true }).click();
  await expect
    .poll(async () => (await readAll<CourseRecord>(page, 'courses'))[0].specificationRef)
    .toEqual(paperSpecificationReference);
  await page.goto('/#/');
  const missing = await importCourse(page, 'missing');
  await openDetails(page, missing.id);
  await expect(page.getByText(/has no supplied metadata/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change selection', exact: true })).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Specification', exact: true })
    .fill('My school syllabus');
  await page.getByRole('textbox', { name: 'Specification', exact: true }).press('Tab');
  await expect
    .poll(
      async () =>
        (await readAll<CourseRecord>(page, 'courses')).find((entry) => entry.id === missing.id)
          ?.specification,
    )
    .toBe('My school syllabus');
  await capture(page, testInfo, 'missing-specification-phone');
  await page.goto('/#/');
  await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await form.getByRole('textbox', { name: 'Course name', exact: true }).fill('Custom study');
  await form.getByRole('radio', { name: /Steady retention/ }).press('Space');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const url = page.url();
  await page.goto(`${url}/settings`);
  await page.getByRole('button', { name: /^Course details/ }).click();
  await expect(page.getByText(/Custom course: no specification metadata supplied/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Exam board', exact: true }).fill('School board');
  await page.getByRole('textbox', { name: 'Exam board', exact: true }).press('Tab');
  await expect
    .poll(
      async () =>
        (await readAll<CourseRecord>(page, 'courses')).find(
          (entry) => entry.name === 'Custom study',
        )?.examBoard,
    )
    .toBe('School board');
});
