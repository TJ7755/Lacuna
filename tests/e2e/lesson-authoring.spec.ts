import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna, enterWithWelcomeCourse } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2, colorScheme: 'light' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
});

test('an empty lesson supports note-first and card-first authoring without losing either path', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Cell biology');
  const courseUrl = page.url();
  const capture = async (name: string) => {
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: 'disabled' });
  };
  await expect(page.getByRole('button', { name: 'New card', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Other ways to study' })).toHaveCount(0);
  await capture('empty-lesson');

  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('Cell structure');
  await title.press('Escape');
  await expect(title).toHaveValue('Cell structure');
  await title.scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await capture('note-editor');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(title).toBeHidden();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await title.fill('Cell structure');
  await page
    .getByRole('textbox', { name: 'Content', exact: true })
    .fill('The nucleus contains the genetic material.');
  await page.getByRole('button', { name: 'preview', exact: true }).click();
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: /^The nucleus contains the genetic material\.$/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'write', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(
    'The nucleus contains the genetic material.',
  );
  await title.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'Cell structure', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Front', exact: true })
    .fill('What does the nucleus contain?');
  await page.getByRole('textbox', { name: 'Back', exact: true }).fill('Genetic material.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 1', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Cards in this lesson' })).toContainText(
    'What does the nucleus contain?',
  );
  await capture('populated-lesson');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cell structure', exact: true })).toBeVisible();

  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lesson', exact: true }).click();
  await page.getByRole('textbox', { name: 'Lesson name', exact: true }).fill('Cell division');
  await page.getByRole('button', { name: 'Create lesson', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cell division', exact: true })).toBeVisible();
  await capture('empty-path-lesson');
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front', exact: true }).fill('What is mitosis?');
  await page
    .getByRole('textbox', { name: 'Back', exact: true })
    .fill('Cell division producing two identical cells.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Study lesson', exact: true })).toBeEnabled();
  await capture('cards-without-notes');
  await page.goto(courseUrl);
  await expect(page.getByRole('button', { name: 'Cell division', exact: true })).toBeVisible();
  await capture('two-lesson-path');
});

test('a populated course retains its path and reading workspace', async ({ page }) => {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: test.info().outputPath('populated-course-path.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Scheduling philosophy', exact: true }).click();
  await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: test.info().outputPath('populated-reading-lesson.png'),
    animations: 'disabled',
  });
});
