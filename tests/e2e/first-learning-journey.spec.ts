import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ deviceScaleFactor: 2 });

for (const { height, scale, reducedMotion, colorScheme } of [
  { height: 956, scale: 1, reducedMotion: 'no-preference', colorScheme: 'light' },
  { height: 956, scale: 1.3, reducedMotion: 'reduce', colorScheme: 'dark' },
  { height: 480, scale: 1, reducedMotion: 'reduce', colorScheme: 'light' },
] as const) {
  test(`keeps the desktop first course and card journey clear (${colorScheme}, ${height}px high)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1470, height });
    await page.emulateMedia({ reducedMotion, colorScheme });
    await page.addInitScript((textScale) => {
      localStorage.setItem('lacuna-font-scale', String(textScale));
      localStorage.setItem('lacuna.inputMode', 'keyboard');
    }, scale);
    await enterFreshLacuna(page);

    const create = page.locator('main').getByRole('button', { name: 'New course', exact: true });
    await expect(create).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'No courses yet' })).toBeVisible();
    await create.click();
    const form = page.getByRole('form', { name: 'New course' });
    const name = form.getByRole('textbox', { name: 'Course name' });
    await expect(name).toBeFocused();
    await expect
      .poll(async () => {
        const field = await name.boundingBox();
        return field !== null && field.y >= 0 && field.y + field.height <= height;
      })
      .toBe(true);
    await expect(form.getByRole('radio', { name: /Steady retention/ })).toBeChecked();
    await form.getByRole('radio', { name: /Exam date/ }).press('Space');
    await expect(form.getByRole('button', { name: 'Exam date and time' })).toBeVisible();
    await form.getByRole('radio', { name: /Steady retention/ }).press('Space');
    await name.fill('Biology');
    const submit = form.getByRole('button', { name: 'Create', exact: true });
    await submit.scrollIntoViewIfNeeded();
    const bounds = (await submit.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await submit.click();
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.getByRole('button', { name: 'Lesson 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lesson 1', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    const front = page.getByRole('textbox', { name: 'Front', exact: true });
    const back = page.getByRole('textbox', { name: 'Back', exact: true });
    await front.fill('What does the nucleus do?');
    await front.press('Tab');
    await expect(back).toBeFocused();
    await back.fill('Controls the cell.');
    await back.press('Tab');
    await expect(page.getByRole('button', { name: 'Save & add another' })).toBeFocused();
    const options = page.getByRole('button', { name: /^Card options/ });
    await expect(options).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Also create reverse' })).toHaveCount(0);
    await options.click();
    await expect(page.getByRole('button', { name: 'Also create reverse' })).toBeVisible();
    await page.getByPlaceholder('Add tags', { exact: true }).fill('cells');
    await page.getByPlaceholder('Add tags', { exact: true }).press('Enter');
    await options.click();
    await options.press('Tab');
    await expect(page.getByRole('button', { name: 'Remove cells' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lesson 1', exact: true })).toBeVisible();
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Study Biology', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await expect(preview.getByRole('button', { name: 'Start session', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: 'Start session', exact: true }).click();
    await expect(
      page
        .locator('[data-study-face="front"]')
        .getByText('What does the nucleus do?', { exact: true }),
    ).toBeVisible();
  });
}
