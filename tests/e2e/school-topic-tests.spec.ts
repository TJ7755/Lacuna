import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block' });

async function importScience(page: Page) {
  await enterFreshLacuna(page);
  await openImport(page);
  const payload = {
    v: 5,
    by: 'School',
    at: 1000,
    li: 'school-test-science',
    rv: 1,
    course: { n: 'School science', o: 0, c: 1000, e: Date.now() + 90 * 86_400_000, um: 'open' },
    lessons: ['Cells', 'Transport', 'Enzymes'].map((name, index) => ({
      i: `lesson-${index}`,
      n: name,
      notes: [],
      cards: [
        {
          id: `card-${index}`,
          k: 0,
          f: `${name} recall`,
          b: `${name} answer`,
          co: `concept-${index}`,
        },
      ],
    })),
    concepts: [0, 1, 2].map((index) => ({ id: `concept-${index}`, n: `Science skill ${index}` })),
    exams: [
      {
        id: 'final',
        n: 'Final exam',
        e: Date.now() + 90 * 86_400_000,
        k: 'f',
        a: null,
        m: 'p',
        c: 1000,
      },
    ],
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
  };
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'School science.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] }),
    ),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page.getByRole('radio', { name: /Exam date/ }).press('Space');
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  await page.mouse.move(0, 0);
  await expect(page.getByText('Added 1 course and 3 cards.')).toBeHidden({ timeout: 10_000 });
  await page.goto('/#/');
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'School science', exact: true })
    .click();
  await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
  return page.url();
}

async function storedRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const names = ['courses', 'lessons', 'cards', 'courseAssessments', 'reviewHistory'];
          const transaction = database.transaction(names);
          const result: Record<string, unknown[]> = {};
          for (const name of names) {
            const rows = transaction.objectStore(name).getAll();
            rows.onsuccess = () => {
              result[name] = rows.result;
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

for (const width of [1440, 390]) {
  test(`creates and revises a pupil-owned topic test at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const courseUrl = await importScience(page);
    const before = await storedRecords(page);

    await page.getByRole('button', { name: 'Add test', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add test', exact: true });
    await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Cancelled test');
    await add.getByRole('button', { name: 'Cells', exact: true }).click();
    await add.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(add).toBeHidden();
    expect((await storedRecords(page)).courseAssessments).toEqual(before.courseAssessments);

    await page.getByRole('button', { name: 'Add test', exact: true }).click();
    await expect(add.getByRole('button', { name: 'Cells', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Biology topic test');
    await add.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(add.getByRole('alert')).toHaveText('Choose at least one lesson for this test.');
    await add.getByRole('button', { name: 'Cells', exact: true }).click();
    await add.getByRole('button', { name: 'Enzymes', exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath('school-test-coverage.png'),
      animations: 'disabled',
    });
    await add.getByRole('button', { name: 'Done', exact: true }).click();

    const details = page.getByRole('dialog', { name: 'Biology topic test details' });
    await expect(details).toBeVisible();
    await expect(details.getByRole('listitem')).toHaveText(['Cells', 'Enzymes']);
    await expect(details.getByText('2 lessons · 2 cards', { exact: true })).toBeVisible();
    type Assessment = {
      id: string;
      kind: string;
      name: string;
      examDate: number;
      lessonIds?: string[];
    };
    const saved = (await storedRecords(page)).courseAssessments as Assessment[];
    const own = saved.find((assessment) => assessment.name === 'Biology topic test')!;
    expect(own.examDate).toBeGreaterThan(Date.now());
    expect(own.lessonIds).toEqual(['lesson-0', 'lesson-2']);
    await page.screenshot({
      path: test.info().outputPath('school-test-details.png'),
      animations: 'disabled',
    });
    await details.getByRole('button', { name: 'Revise for Biology topic test' }).click();
    await expect(page).toHaveURL(new RegExp(`assessmentId=${own.id}`));
    await expect(
      page.getByRole('heading', { name: 'Biology topic test', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create plan', exact: true })).toBeVisible();

    await page.goto(courseUrl);
    const assessments = page.getByRole('region', { name: 'Assessments', exact: true });
    await assessments.getByRole('button', { name: /Biology topic test/ }).click();
    await details.getByRole('button', { name: 'Edit test', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit test', exact: true });
    await edit.getByRole('button', { name: 'Enzymes', exact: true }).click();
    await edit.getByRole('button', { name: 'Transport', exact: true }).click();
    await edit.getByRole('button', { name: 'Choose date and time', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: 'Choose date and time', exact: true });
    await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
    const date = new Date(own.examDate);
    date.setMonth(date.getMonth() + 1, 15);
    await calendar
      .getByRole('button', {
        name: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        exact: true,
      })
      .click();
    await calendar.getByRole('button', { name: 'Done', exact: true }).click();
    await edit.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(details.getByRole('listitem')).toHaveText(['Cells', 'Transport']);
    await page.reload();
    await expect(details.getByRole('listitem')).toHaveText(['Cells', 'Transport']);
    const after = await storedRecords(page);
    const changed = (after.courseAssessments as Assessment[]).find(
      (assessment) => assessment.id === own.id,
    )!;
    expect(changed.examDate).not.toBe(own.examDate);
    expect(after.cards).toEqual(before.cards);
    expect(after.lessons).toEqual(before.lessons);
    expect(after.reviewHistory).toEqual(before.reviewHistory);
    expect(
      (after.courseAssessments as Assessment[]).filter((assessment) => assessment.kind === 'final'),
    ).toEqual(before.courseAssessments);

    await details.getByRole('button', { name: 'Close assessment details' }).click();
    await assessments.getByRole('button', { name: /Final exam/ }).click();
    const final = page.getByRole('dialog', { name: 'Final exam details' });
    await expect(final.getByRole('button', { name: 'Edit test', exact: true })).toHaveCount(0);
    await final.getByRole('button', { name: 'Close assessment details' }).click();
    await page.goto(`${courseUrl}/settings`);
    await page.getByRole('button', { name: 'Archive course', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Archive School science?' })
      .getByRole('button', { name: 'Archive course', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/$/);
    await page.goto(courseUrl);
    await expect(
      page.getByText('Restore this course from Archived to study or make changes.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add test', exact: true })).toHaveCount(0);
  });
}
