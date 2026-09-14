import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('keeps the sidebar quiet and shows study details beside a hovered course', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  const sidebar = page.getByRole('complementary');
  const course = sidebar.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  await expect(course).toHaveText('Welcome to Lacuna');
  await expect(sidebar.locator('kbd')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await course.hover();
  const card = page.getByRole('tooltip');
  await expect(card).toBeVisible();
  await expect(card.getByText('Ready to study', { exact: true })).toBeVisible();
  await expect(card.getByText('New cards', { exact: true })).toBeVisible();
  await expect(card.getByText('Exam', { exact: true })).toBeVisible();
  expect((await card.boundingBox())!.x).toBeGreaterThanOrEqual(
    (await sidebar.boundingBox())!.x + (await sidebar.boundingBox())!.width,
  );
  await card.hover();
  await expect(card).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('course-details.png'),
  });
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).hover();
  await expect(card.getByText('Day streak', { exact: true })).toBeVisible();
  await expect(card.getByText('Reviewed today', { exact: true })).toBeVisible();
  await page.mouse.move(1000, 900);
  await expect(card).toHaveCount(0);
});

test('shows details on focus in the collapsed rail and dismisses on navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  const course = page
    .getByRole('complementary')
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  await course.focus();
  const card = page.getByRole('tooltip');
  await expect(card).toBeVisible();
  await expect(course).toHaveAttribute('aria-describedby', (await card.getAttribute('id')) ?? '');
  expect(await card.evaluate((element) => element.getAnimations().length)).toBe(0);
  const bounds = (await card.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('collapsed-details.png'),
  });
  await course.press('Enter');
  await expect(page).toHaveURL(/#\/course\//);
  await expect(card).toHaveCount(0);
});

test.describe('touch navigation', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('opens a course directly without showing a hover card', async ({ page }) => {
    await enterFreshLacuna(page);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).tap();
    await page
      .getByRole('complementary')
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .tap();
    await expect(page).toHaveURL(/#\/course\//);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});
