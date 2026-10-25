import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

for (const width of [1440, 390]) {
  test(`joins a locked course midway and studies prior knowledge separately at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await openImport(page);
    const payload = {
      v: 5,
      by: 'Teacher',
      at: 1000,
      li: 'three-year-science',
      rv: 1,
      course: {
        n: 'Three-year science',
        o: 0,
        c: 1000,
        e: Date.now() + 365 * 86400000,
        um: 'semi-linear',
      },
      lessons: ['Year one', 'Year two', 'Year three'].map((name, index) => ({
        i: `year-${index + 1}`,
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
      exams: [
        {
          id: 'final',
          n: 'Final exam',
          e: Date.now() + 365 * 86400000,
          k: 'f',
          a: null,
          m: 'p',
          c: 1000,
        },
      ],
      concepts: [0, 1, 2].map((index) => ({ id: `concept-${index}`, n: `Concept ${index}` })),
      questions: [],
      questionSets: [],
      questionSetPracticeNodes: [],
    };
    await page.getByLabel('Import file').setInputFiles({
      name: 'Science.lacuna',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] }),
      ),
    });
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
    await page.getByRole('radio', { name: /Exam date/ }).press('Space');
    await page.getByRole('button', { name: 'Add to my courses' }).click();
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
    // The import result links directly to the local course on desktop and mobile.
    await page.goto('/#/');
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Three-year science', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    const courseUrl = page.url();
    await page.goto(`${courseUrl}/settings`);
    const sharing = page.getByRole('button', { name: 'How sharing works' });
    await expect(sharing).toBeVisible();
    expect((await sharing.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(/activity already recorded today and yesterday/)).toBeVisible();
    await expect(sharing).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: /^Lessons/ }).click();
    const picker = page.getByRole('combobox', { name: 'Start study from' });
    await picker.selectOption({ label: 'Year two' });
    await expect(picker).toBeEnabled();
    await expect(picker).toHaveValue('year-2');
    await picker.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`entry-settings-${width}.png`),
      animations: 'disabled',
    });
    await page.reload();
    await page.getByRole('button', { name: /^Lessons/ }).click();
    await expect(page.getByRole('combobox', { name: 'Start study from' })).toHaveValue('year-2');
    await page.goto(courseUrl);
    await expect(page.getByRole('button', { name: 'Year one', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Year two', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await expect(preview.getByRole('list', { name: "Today's session" })).toContainText('Year two');
    await expect(preview.getByRole('button', { name: /Review earlier material/ })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`entry-study-${width}.png`),
      animations: 'disabled',
    });
    await preview.getByRole('button', { name: /Review earlier material/ }).click();
    await expect(
      page.locator('[data-study-face="front"]').getByText('Year one recall', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Year two recall', { exact: true })).toHaveCount(0);
    await page.goto(courseUrl);
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await expect(
      page.locator('[data-study-face="front"]').getByText('Year two recall', { exact: true }),
    ).toBeVisible();
  });
}
