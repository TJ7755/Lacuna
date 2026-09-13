import { expect, test } from '@playwright/test';

test('the brand keeps its size and centres in the collapsed rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();

  const mark = page.getByTestId('sidebar-brand-mark');
  await expect.poll(async () => (await mark.boundingBox())?.width).toBe(36);
  const expanded = await mark.boundingBox();
  expect(expanded).not.toBeNull();
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('expanded.png') });

  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect
    .poll(async () => {
      const bounds = await mark.boundingBox();
      const rail = await page.getByRole('complementary').boundingBox();
      if (!bounds || !rail) return Infinity;
      return Math.abs(bounds.x + bounds.width / 2 - (rail.x + rail.width / 2));
    })
    .toBeLessThanOrEqual(1);

  const collapsed = await mark.boundingBox();
  const rail = await page.getByRole('complementary').boundingBox();
  expect(collapsed).not.toBeNull();
  expect(rail).not.toBeNull();
  expect(collapsed!.width).toBe(expanded!.width);
  expect(collapsed!.width).toBe(collapsed!.height);
  expect(
    Math.abs(collapsed!.x + collapsed!.width / 2 - (rail!.x + rail!.width / 2)),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('collapsed.png') });
});

test('the mobile brand retains its original proportions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();

  const mark = page.getByTestId('mobile-brand-mark');
  await expect(mark).toHaveCSS('width', '18px');
  await expect(mark).toHaveCSS('height', '18px');
  await expect(mark.locator('..')).toHaveCSS('font-size', '18px');
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('mobile.png') });
});
