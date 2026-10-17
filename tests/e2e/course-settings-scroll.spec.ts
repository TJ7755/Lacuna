import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('course settings keeps primary cards together and stacks them on narrower screens', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const course = page
    .getByRole('navigation', { name: 'Courses' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  await course.click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);
  await expect(page.getByRole('heading', { name: 'Course settings', exact: true })).toBeVisible();
  const goal = page.locator('#course-settings-goal');
  const workload = page.locator('#course-settings-study');
  await expect(goal).toBeVisible();
  await expect(workload).toBeVisible();
  const [goalWide, workloadWide] = await Promise.all([goal.boundingBox(), workload.boundingBox()]);
  expect(workloadWide!.x).toBeGreaterThan(goalWide!.x + goalWide!.width);
  expect(Math.abs(workloadWide!.y - goalWide!.y)).toBeLessThan(1);
  await page.screenshot({
    path: test.info().outputPath('primary-settings.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 900, height: 900 });
  const [goalNarrow, workloadNarrow] = await Promise.all([goal.boundingBox(), workload.boundingBox()]);
  expect(workloadNarrow!.x).toBe(goalNarrow!.x);
  expect(workloadNarrow!.y).toBeGreaterThanOrEqual(goalNarrow!.y + goalNarrow!.height);
});

test('mobile course settings opens secondary settings from the keyboard without obstructing the fields', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);

  const details = page.getByRole('button', { name: 'Course details', exact: true });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveCount(0);
  await details.focus();
  await details.press('Enter');
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  const name = page.getByRole('textbox', { name: 'Course name', exact: true });
  await expect(name).toBeVisible();
  await name.scrollIntoViewIfNeeded();
  const bounds = (await name.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await name.click();
  await expect(name).toBeFocused();
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveCount(0);
});
