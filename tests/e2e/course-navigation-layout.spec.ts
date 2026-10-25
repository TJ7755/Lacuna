import { expect, test, type Page } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

const COURSE_SECTIONS = [
  { label: 'Path', heading: 'Welcome to Lacuna' },
  { label: 'Cards', heading: 'Cards' },
  { label: 'Questions', heading: 'Questions' },
  { label: 'Settings', heading: 'Course settings' },
] as const;

test('workspace mode is shared by every course section', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSeededCourse(page);
  for (const [index, section] of COURSE_SECTIONS.entries()) {
    await page
      .locator('nav[aria-label="Course sections"]:visible')
      .getByRole('link', { name: section.label, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: section.heading, exact: true }).first(),
    ).toBeVisible();
    const mode = page.getByRole('group', { name: 'Workspace mode' });
    await expect(mode).toBeVisible();
    if (index > 0) {
      await expect(
        mode.getByRole('button', { name: index % 2 ? 'Edit mode' : 'View mode' }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    const targetMode = mode.getByRole('button', { name: index % 2 ? 'View mode' : 'Edit mode' });
    await targetMode.click();
    await expect(targetMode).toHaveAttribute('aria-pressed', 'true');
  }
  await page.reload();
  // The loop alternates modes, so the last section leaves the mode the reload must keep.
  const lastMode = (COURSE_SECTIONS.length - 1) % 2 ? 'View mode' : 'Edit mode';
  await expect(page.getByRole('button', { name: lastMode, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

async function openSeededCourse(page: Page): Promise<void> {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome to Lacuna', exact: true }),
  ).toBeVisible();
}

test('dragging the course selection previews then opens the released section', async ({ page }) => {
  await openSeededCourse(page);
  const navigation = page.locator('nav[aria-label="Course sections"]:visible');
  const path = await navigation.getByRole('link', { name: 'Path', exact: true }).boundingBox();
  const cards = await navigation.getByRole('link', { name: 'Cards', exact: true }).boundingBox();
  await page.mouse.move(path!.x + path!.width / 2, path!.y + path!.height / 2);
  await page.mouse.down();
  await page.mouse.move(cards!.x + cards!.width / 2, cards!.y + cards!.height / 2, { steps: 12 });
  await expect(navigation.getByRole('link', { name: 'Path', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.mouse.up();
  await expect(page).toHaveURL(/\/cards$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome to Lacuna', exact: true }),
  ).toHaveCount(0);
  await expect(navigation).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: 'Cards', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('link', { name: 'Cards', exact: true }).press('ArrowRight');
  await expect(page).toHaveURL(/\/questions$/);
});

test('settings retain accessible speed stops and shared switches', async ({ page }) => {
  await openSeededCourse(page);
  await page.goto('/#/settings');
  const speeds = page.getByRole('radiogroup', { name: 'Animation speed' });
  await speeds.getByRole('radio', { name: 'Slow' }).click();
  await expect(speeds.getByRole('radio', { name: 'Slow' })).toBeChecked();
  await speeds.getByRole('radio', { name: 'Slow' }).press('ArrowRight');
  await expect(speeds.getByRole('radio', { name: 'Normal' })).toBeChecked();
  await speeds.screenshot({ path: '/tmp/lacuna-speed-control.png' });
  const toggle = page.getByRole('switch').first();
  const checked = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true');
  await toggle.screenshot({ path: '/tmp/lacuna-switch.png' });
  for (const radio of await speeds.getByRole('radio').all()) {
    expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('a long course name truncates beside the section tabs instead of running under them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSeededCourse(page);
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  await page.getByRole('button', { name: 'Rename course', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Course name', exact: true });
  const longName = 'A-level Mathematics: Pure, Statistics and Mechanics (Edexcel 9MA0)';
  await input.fill(longName);
  await input.press('Enter');
  await page
    .locator('nav[aria-label="Course sections"]:visible')
    .getByRole('link', { name: 'Cards', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cards', exact: true })).toBeVisible();
  const navigation = page.locator('[data-course-page-navigation]');
  const name = await navigation.getByRole('link', { name: longName }).boundingBox();
  const tabs = await navigation.locator('nav[aria-label="Course sections"]').boundingBox();
  expect(name!.x + name!.width).toBeLessThanOrEqual(tabs!.x);
});
