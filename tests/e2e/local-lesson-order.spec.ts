import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

test('keeps automatic practice and checkpoint coverage when a locked course is reordered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await openImport(page);
  const examDate = Date.now() + 90 * 86_400_000;
  const payload = {
    v: 5,
    by: 'Teacher',
    at: 1000,
    li: 'local-order-science',
    rv: 1,
    course: { n: 'School science', o: 0, c: 1000, e: examDate, um: 'open' },
    lessons: ['A', 'B', 'C'].map((id) => ({
      i: id,
      n: `Topic ${id}`,
      notes: [],
      cards: [
        { id: `card-${id}`, k: 0, f: `${id} recall`, b: `${id} answer`, co: `concept-${id}` },
      ],
    })),
    exams: [
      {
        id: 'checkpoint',
        n: 'Topic test',
        e: examDate - 30 * 86_400_000,
        k: 'c',
        a: 0,
        m: 'p',
        c: 1000,
      },
      { id: 'final', n: 'Final exam', e: examDate, k: 'f', a: null, m: 'p', c: 1000 },
    ],
    concepts: ['A', 'B', 'C'].map((id) => ({ id: `concept-${id}`, n: `Concept ${id}` })),
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
  };
  await page.getByLabel('Import file').setInputFiles({
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
  await page.goto('/#/');
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'School science', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const courseUrl = page.url();
  await page.goto(`${courseUrl}/settings`);
  await page.getByRole('button', { name: /^Auto-practice/ }).click();
  await expect(page.getByRole('switch', { name: 'Auto-practice', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Lessons/ }).click();
  await page.getByRole('button', { name: 'Move Topic C up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Topic B down', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Topic C up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Topic C up', exact: true })).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath('local-order-settings.png'),
    animations: 'disabled',
  });
  await page.reload();
  await page.getByRole('button', { name: /^Lessons/ }).click();
  await expect(page.getByRole('button', { name: 'Move Topic C up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use publisher order' })).toBeVisible();
  await page.goto(courseUrl);
  const path = page.getByRole('list', { name: 'Course path' });
  await expect
    .poll(async () =>
      path
        .locator('[data-path-source]')
        .evaluateAll((rows) =>
          rows
            .map((row) => row.getAttribute('data-path-source'))
            .filter((id) => ['A', 'B', 'C', 'checkpoint'].includes(id ?? '')),
        ),
    )
    .toEqual(['C', 'A', 'checkpoint', 'B']);
  await page.screenshot({
    path: test.info().outputPath('local-order-path.png'),
    animations: 'disabled',
  });
  await path.getByRole('button', { name: 'Open checkpoint: Topic test', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Topic test details' });
  await expect(details.getByRole('listitem')).toHaveText(['Topic C', 'Topic A']);
  await expect(details.getByText('2 lessons · 2 cards', { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('local-order-checkpoint.png'),
    animations: 'disabled',
  });
});
