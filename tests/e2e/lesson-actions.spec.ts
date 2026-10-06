import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function openWelcomeInEditMode(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
}

function pathLessonNames(page: Page) {
  return page
    .getByRole('list', { name: 'Course path' })
    .locator('[data-path-lesson] > button')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));
}

test('path rows open lesson actions from right-click and Shift+F10, and move lessons', async ({
  page,
}) => {
  await openWelcomeInEditMode(page);
  const before = await pathLessonNames(page);
  expect(before.length).toBeGreaterThan(1);
  const first = page.locator('[data-path-lesson] > button').first();

  await first.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `Lesson actions: ${before[0]}` });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused();
  await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await first.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Move down' }).click();
  await expect
    .poll(() => pathLessonNames(page))
    .toEqual([before[1], before[0], ...before.slice(2)]);
});

test('deleting a lesson states its consequences, moves focus and can be undone', async ({
  page,
}) => {
  await openWelcomeInEditMode(page);
  const before = await pathLessonNames(page);
  const trigger = page.getByRole('button', { name: `Lesson actions: ${before[0]}` });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Delete lesson' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete ${before[0]}?` });
  await expect(dialog).toContainText('stay in the course without a lesson');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Delete lesson' }).click();
  await dialog.getByRole('button', { name: 'Delete lesson' }).click();
  await expect.poll(() => pathLessonNames(page)).toEqual(before.slice(1));
  await expect(page.locator('[data-path-lesson] > button').first()).toBeFocused();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pathLessonNames(page)).toEqual(before);
});

test('the lesson heading offers the same actions and deleting it returns to the path', async ({
  page,
}) => {
  await openWelcomeInEditMode(page);
  const before = await pathLessonNames(page);
  await page.locator('[data-path-lesson] > button').nth(1).click();
  const heading = page.getByRole('heading', { level: 1, name: before[1] });
  await expect(heading).toBeVisible();
  await heading.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `Lesson actions: ${before[1]}` });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Delete lesson' }).click();
  await page
    .getByRole('dialog', { name: `Delete ${before[1]}?` })
    .getByRole('button', { name: 'Delete lesson' })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await expect(page.locator('#course-path-heading')).toBeFocused();
  await expect.poll(() => pathLessonNames(page)).toEqual([before[0], ...before.slice(2)]);
});
