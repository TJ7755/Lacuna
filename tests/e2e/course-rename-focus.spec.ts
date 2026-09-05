import { expect, test } from '@playwright/test';

test('opening the course rename field focuses and selects its title', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await page.getByRole('button', { name: /Exam in .* Welcome to Lacuna/ }).click();
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Author mode', exact: true }).click();
  await page.getByRole('button', { name: 'Rename course', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'course name', exact: true });
  await expect(input).toBeFocused();
  expect(await input.evaluate((element: HTMLInputElement) =>
    element.selectionStart === 0 && element.selectionEnd === element.value.length,
  )).toBe(true);
  await input.press('Escape');
  await expect(input).toHaveCount(0);
});
