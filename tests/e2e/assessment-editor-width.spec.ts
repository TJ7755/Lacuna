import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('assessment card exclusions fit the settings editor', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('complementary').getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);
  await page.getByRole('button', { name: 'Edit Final exam', exact: true }).click();
  const search = page.getByPlaceholder('Search covered cards…');
  await expect(search).toBeVisible();
  const fieldset = search.locator('..');
  const editor = fieldset.locator('..');
  await expect.poll(async () => {
    const [field, parent] = await Promise.all([fieldset.boundingBox(), editor.boundingBox()]);
    return field!.x + field!.width <= parent!.x + parent!.width + 1;
  }).toBe(true);
  await search.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('assessment-width.png'), animations: 'disabled' });
});
