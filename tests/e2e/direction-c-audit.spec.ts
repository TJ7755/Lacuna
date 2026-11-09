import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('the course bar stays at the top while a course page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(page).toHaveURL(/\/course\/[^/]+\/settings$/);
  const bar = page.locator('[data-course-page-navigation]');
  // Settings loads after the URL changes; scrolling an unloaded page has nowhere to go.
  await expect(page.locator('#course-settings-study')).toBeVisible();
  await page.getByRole('button', { name: /^Lessons / }).click();
  const main = page.locator('main');
  await main.evaluate((element) => element.scrollTo({ top: 900, behavior: 'instant' }));
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop))
    .toBeGreaterThanOrEqual(900);
  const y = (await bar.boundingBox())!.y;
  expect(y).toBeGreaterThanOrEqual(-1);
  expect(y).toBeLessThanOrEqual(1);
});
