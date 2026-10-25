import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('opening the course rename field focuses and selects its title', async ({ page }) => {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await page.getByRole('button', { name: 'Rename course', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Course name', exact: true });
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (element: HTMLInputElement) =>
        element.selectionStart === 0 && element.selectionEnd === element.value.length,
    ),
  ).toBe(true);
  await input.press('Escape');
  await expect(input).toHaveCount(0);
});
