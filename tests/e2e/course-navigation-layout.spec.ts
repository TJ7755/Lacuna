import { expect, test, type Page } from '@playwright/test';

const COURSE_SECTIONS = [
  { label: 'Path', heading: 'Curriculum' },
  { label: 'Cards', heading: 'Cards' },
  { label: 'Questions', heading: 'Questions' },
  { label: 'Analytics', heading: 'Analytics' },
  { label: 'Settings', heading: 'Settings' },
] as const;

test('course section navigation keeps one stable horizontal position', async ({ page }) => {
  await openSeededCourse(page);
  const positions: Array<{ label: string; centreX: number }> = [];

  for (const section of COURSE_SECTIONS) {
    const navigation = page.locator('nav[aria-label="Course sections"]:visible');
    if (section.label !== 'Path') {
      await navigation.getByRole('link', { name: section.label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: section.heading, exact: true }).first(),
      ).toBeVisible();
    }

    await expect(navigation).toHaveCount(1);
    const bounds = await navigation.boundingBox();
    expect(bounds, `${section.label} navigation must be visible`).not.toBeNull();
    positions.push({
      label: section.label,
      centreX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
    });
  }

  const baseline = positions[0];
  for (const position of positions.slice(1)) {
    expect(
      Math.abs(position.centreX - baseline.centreX),
      `${position.label} navigation moved relative to ${baseline.label}`,
    ).toBeLessThanOrEqual(1);
  }
});

async function openSeededCourse(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toBeVisible();
}

test('course controls use rounded rectangles and schedule metadata sits below the actions', async ({
  page,
}) => {
  await openSeededCourse(page);
  const navigation = page.locator('nav[aria-label="Course sections"]:visible');
  const study = page.getByRole('button', { name: 'Study', exact: true });
  const schedule = page.getByRole('group', { name: 'Study schedule' });
  await expect(schedule).toBeVisible();
  await expect(page.getByText(/^Next:/)).toHaveCount(0);
  const radius = await study.evaluate((element) => getComputedStyle(element).borderRadius);
  expect(await navigation.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(
    radius,
  );
  expect((await schedule.boundingBox())!.y).toBeGreaterThan((await study.boundingBox())!.y);
  await page.screenshot({ path: '/tmp/lacuna-course-rounded.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(schedule).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

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
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toHaveCount(0);
  await expect(navigation).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: 'Cards', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('link', { name: 'Cards', exact: true }).press('ArrowRight');
  await expect(page).toHaveURL(/\/questions$/);
});

test('the course selection expands while held and settles after release', async ({ page }) => {
  await openSeededCourse(page);
  const indicator = page.locator('[data-course-tab-indicator]');
  const before = (await indicator.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await expect
    .poll(async () => (await indicator.boundingBox())!.width)
    .toBeGreaterThan(before.width * 1.03);
  await page.mouse.up();
  await expect
    .poll(async () => Math.abs((await indicator.boundingBox())!.width - before.width))
    .toBeLessThan(0.5);
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('motion-speed-thumb')).toHaveCSS('transition-property', 'none');
});

test('the selection follows pointer distance continuously between section centres', async ({
  page,
}) => {
  await openSeededCourse(page);
  const indicator = page.locator('[data-course-tab-indicator]');
  const start = (await indicator.boundingBox())!;
  const centre = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  await page.mouse.move(centre, y);
  await page.mouse.down();
  await page.mouse.move(centre + 12, y, { steps: 3 });
  await expect
    .poll(async () => {
      const bounds = (await indicator.boundingBox())!;
      return Math.abs(bounds.x + bounds.width / 2 - centre - 12);
    })
    .toBeLessThan(2);
  await page.mouse.move(centre + 24, y, { steps: 3 });
  await expect
    .poll(async () => {
      const bounds = (await indicator.boundingBox())!;
      return Math.abs(bounds.x + bounds.width / 2 - centre - 24);
    })
    .toBeLessThan(2);
  await page.mouse.up();
});
