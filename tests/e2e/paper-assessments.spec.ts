import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { Card, CourseAssessment, CourseRecord, Lesson } from '../../src/db/types';
import type { ReviewHistoryEntry } from '../../src/db/reviewHistory';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../src/specifications/paperFixture.testFixtures';
import { chooseScheduledStudy, enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

test.use({ timezoneId: 'Europe/London' });

const COURSE = 'Course-supplied paper coverage';

function paperDate(day: number): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, day, 12);
}

async function chooseDate(page: Page, label: string, day: number) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose date and time' });
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(paperDate(day));
  await picker.getByRole('button', { name: date, exact: true }).click();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(picker).toBeHidden();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[aria-label="Notifications"] > *')).toHaveCount(0, {
    timeout: 10_000,
  });
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function evidence(page: Page) {
  const [cards, reviews, lessons] = await Promise.all([
    readAll<Card>(page, 'cards'),
    readAll<ReviewHistoryEntry>(page, 'reviewHistory'),
    readAll<Lesson>(page, 'lessons'),
  ]);
  return { cards, reviews, lessons };
}

async function importPaperCourse(page: Page) {
  await enterFreshLacuna(page);
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Synthetic science.lacuna',
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
            n: COURSE,
            o: 0,
            c: Date.now(),
            e: paperDate(20),
            um: 'open',
            lf: 0,
            specificationData: paperSpecification,
            specificationRef: paperSpecificationReference,
          },
          lessons: [
            {
              i: 'mixed-lesson',
              n: 'Mixed science lesson',
              notes: [],
              cards: [
                {
                  id: 'cells-card',
                  co: 'cells',
                  k: 0,
                  f: 'Name the basic unit of life.',
                  b: 'A cell.',
                },
                {
                  id: 'enzymes-card',
                  co: 'enzymes',
                  k: 0,
                  f: 'What does an enzyme do?',
                  b: 'Catalyses a reaction.',
                },
              ],
            },
          ],
          concepts: [
            { id: 'cells', n: 'Cells', specificationPointIds: ['example-science:cells'] },
            { id: 'enzymes', n: 'Enzymes', specificationPointIds: ['example-science:enzymes'] },
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
  const courses = await readAll<CourseRecord>(page, 'courses');
  const course = courses.find((entry) => entry.name === COURSE);
  expect(course).toBeDefined();
  return course!;
}

for (const width of [1440, 390]) {
  test(`sets paper dates and preserves scoped learner evidence at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const course = await importPaperCourse(page);
    await page.goto(`/#/course/${course.id}`);
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await chooseScheduledStudy(page);
    const studyCard = page.locator('[data-study-card-id]');
    await expect(studyCard).toBeVisible();
    const reviewedCardId = await studyCard.getAttribute('data-study-card-id');
    await page.keyboard.press('Space');
    await page.keyboard.press('Y');
    await expect
      .poll(
        async () =>
          (await readAll<ReviewHistoryEntry>(page, 'reviewHistory')).filter(
            (review) => review.cardId === reviewedCardId,
          ).length,
      )
      .toBe(1);
    await page.goto(`/#/course/${course.id}/settings`);
    const before = await evidence(page);
    expect(before.cards).toHaveLength(2);
    expect(before.reviews).toHaveLength(1);

    await page.getByRole('button', { name: 'Set up paper dates', exact: true }).click();
    const setup = page.getByRole('region', { name: 'Paper dates', exact: true });
    await expect(
      setup.getByText('Source: Synthetic specification, 1.', { exact: true }),
    ).toBeVisible();
    await setup.getByRole('button', { name: 'Date and time for First paper', exact: true }).click();
    const invalidTimePicker = page.getByRole('dialog', { name: 'Choose date and time' });
    await invalidTimePicker.getByRole('textbox', { name: 'Hour', exact: true }).fill('99');
    await expect(
      setup.getByRole('button', { name: 'Save paper dates', exact: true }),
    ).toBeDisabled();
    await invalidTimePicker.getByRole('textbox', { name: 'Hour', exact: true }).fill('12');
    await invalidTimePicker.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(invalidTimePicker).toBeHidden();
    await expect(
      setup.getByRole('button', { name: 'Save paper dates', exact: true }),
    ).toBeEnabled();
    await setup.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await readAll<CourseAssessment>(page, 'courseAssessments')).toHaveLength(1);
    await page.getByRole('button', { name: 'Set up paper dates', exact: true }).click();
    await chooseDate(page, 'Date and time for First paper', 10);
    await setup.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `paper-date-setup-${width}`);
    await setup.getByRole('button', { name: 'Save paper dates', exact: true }).click();
    await expect(setup).toBeHidden();
    const papers = await readAll<CourseAssessment>(page, 'courseAssessments');
    expect(papers).toHaveLength(2);
    expect(papers.filter((entry) => entry.kind === 'final')).toHaveLength(1);
    expect(papers.find((entry) => entry.specificationPaperId === 'paper-1')).toMatchObject({
      kind: 'checkpoint',
      coverageMode: 'specification',
      specificationPaperId: 'paper-1',
    });
    expect(papers.find((entry) => entry.kind === 'final')).toMatchObject({
      coverageMode: 'specification',
      specificationPaperId: 'paper-2',
    });

    await page.getByRole('button', { name: 'Edit 1: First paper', exact: true }).click();
    const search = page.getByPlaceholder('Search covered cards…');
    const editor = search.locator('xpath=../..');
    await expect(editor.getByText('1 lesson · 1 card', { exact: true })).toBeVisible();
    await expect(editor.getByText('Name the basic unit of life.', { exact: true })).toBeVisible();
    await expect(editor.getByText('What does an enzyme do?', { exact: true })).toHaveCount(0);
    await chooseDate(page, 'Date and time', 12);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(search).toBeHidden();
    const edited = (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
      (entry) => entry.specificationPaperId === 'paper-1',
    )!;
    expect(edited.coverageMode).toBe('specification');
    expect(new Date(edited.examDate!).getUTCDate()).toBe(12);

    await page.getByRole('button', { name: 'Edit 1: First paper', exact: true }).click();
    await chooseDate(page, 'Date and time', 25);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('The final assessment must be dated at or after every paper.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
        (entry) => entry.id === edited.id,
      )?.examDate,
    ).toBe(edited.examDate);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('button', { name: 'Edit 1: First paper', exact: true }),
    ).toBeVisible();
    expect(await evidence(page)).toEqual(before);
    expect(await readAll<CourseRecord>(page, 'courses')).toHaveLength(1);
    expect(await readAll<CourseAssessment>(page, 'courseAssessments')).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Edit 2: Second paper', exact: true }).click();
    await expect(page.getByText('1 lesson · 2 cards', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .getByRole('button', { name: 'Edit 1: First paper', exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, testInfo, `saved-paper-dates-${width}`);
    await page.goto(`/#/course/${course.id}`);
    await expect(
      page
        .getByRole('region', { name: 'Course summary' })
        .getByText('Predicted recall', { exact: true }),
    ).toBeVisible();
    await page.goto(`/#/course/${course.id}/settings`);
    await page.getByRole('button', { name: 'Secure topics', exact: true }).click();
    await expect
      .poll(async () => (await readAll<CourseRecord>(page, 'courses'))[0].examObjective)
      .toBe('securedTopics');
    await page.goto(`/#/course/${course.id}`);
    const summary = page.getByRole('region', { name: 'Course summary' });
    await expect(summary.getByText('Secured cards', { exact: true })).toBeVisible();
    await expect(summary.getByText('0%', { exact: true })).toBeVisible();
    await page
      .getByRole('region', { name: 'Assessments', exact: true })
      .getByRole('button', { name: /1: First paper/ })
      .click();
    const details = page.getByRole('dialog', { name: '1: First paper details', exact: true });
    await expect(details.getByText('1 lesson · 1 card', { exact: true })).toBeVisible();
    await expect(details.getByRole('button', { name: /Revise/ })).toHaveCount(0);
    await capture(page, testInfo, `paper-coverage-details-${width}`);
    await details.getByRole('button', { name: 'Close assessment details', exact: true }).click();
    await expect(details).toBeHidden();
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await preview.getByRole('button', { name: 'Other ways', exact: true }).click();
    await preview.getByRole('button', { name: 'Revise for 1: First paper', exact: true }).click();
    await expect(preview).toBeHidden();
    const cellsCard = before.cards.find((card) => card.front === 'Name the basic unit of life.');
    expect(cellsCard).toBeDefined();
    const scopedCard = page.locator('[data-study-card-id]:not([inert])').filter({ visible: true });
    await expect(scopedCard).toHaveAttribute('data-study-card-id', cellsCard!.id);
    await expect(
      scopedCard
        .getByText('Name the basic unit of life.', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(scopedCard.getByText('What does an enzyme do?', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Time available today', exact: true }),
    ).toHaveCount(0);
    expect(await evidence(page)).toEqual(before);
  });
}
