import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('course settings follows scrolling after the course loads', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const course = page.getByRole('complementary').getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  await course.click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);
  const rail = page.getByRole('complementary', { name: 'Page sections' });
  await expect(rail).toBeVisible();
  await page.locator('#course-settings-content').evaluate((element) => element.scrollIntoView());
  await expect(rail.getByRole('button', { name: 'Content', exact: true })).toHaveClass(/text-accent/);
  await page.screenshot({ path: test.info().outputPath('content-scroll.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.locator('#course-settings-study').evaluate((element) => element.scrollIntoView());
  await expect(page.getByLabel('Jump to section')).toHaveValue('course-settings-study');
});
