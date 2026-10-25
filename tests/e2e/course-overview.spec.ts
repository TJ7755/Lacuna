import { expect, test } from '@playwright/test';
import { createCourse, enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const single of [true, false]) {
  test(`a ${single ? 'single' : 'multi'}-lesson ladder opens its real workspace and returns to the path`, async ({
    page,
  }) => {
    await enterWithWelcomeCourse(page);
    if (single) await createCourse(page, 'Biology', false);
    else
      await page
        .getByRole('region', { name: 'Today, most urgent first' })
        .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
        .click();
    const courseUrl = page.url();
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: single ? 'Lesson 1' : 'Scheduling philosophy', exact: true })
      .click();
    await expect(page).toHaveURL(/\/lesson\//);
    await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(courseUrl);
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.goForward();
    await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
    await page.getByRole('link', { name: 'Path', exact: true }).click();
    await page.getByRole('button', { name: 'Edit mode' }).click();
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await add.click();
    await page.getByRole('menuitem', { name: 'Lesson', exact: true }).click();
    await page.getByRole('textbox', { name: 'Lesson name' }).fill('Course overview regression');
    await page.getByRole('button', { name: 'Create lesson' }).click();
    await expect(page).toHaveURL(/\/lesson\//);
    await expect(
      page.getByRole('heading', { name: 'Course overview regression', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Path', exact: true }).click();
    await expect(page).toHaveURL(courseUrl);
    await expect(
      page.getByRole('button', { name: 'Course overview regression', exact: true }),
    ).toBeVisible();
  });
}

test('narrow-screen keyboard activation opens the focused lesson', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  const stop = page.getByRole('button', { name: 'Scheduling philosophy', exact: true });
  await stop.focus();
  await stop.press('Enter');
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(
    page.getByRole('heading', { name: 'Scheduling philosophy', exact: true }),
  ).toBeVisible();
});

test('practice editing keeps an unobstructed 44px touch target with a long name', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Card practice', exact: true }).click();
  const name = 'Practice with a long name covering several lines';
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const actions = page.getByRole('button', { name: `Practice actions: ${name}`, exact: true });
  await expect(actions).toBeVisible();
  await actions.scrollIntoViewIfNeeded();
  const bounds = await actions.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const row = actions.locator('xpath=ancestor::li[1]');
  const previous = await row.locator('xpath=preceding-sibling::li[1]').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(previous!.y + previous!.height);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name);
});
