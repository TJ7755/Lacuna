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

test.describe('touch course navigation', () => {
  test.use({ hasTouch: true, serviceWorkers: 'block' });

  test('the course selection follows the finger and settles directly into the released tab', async ({
    page,
  }) => {
    // Keep Cards loading through release so the route cannot hide a recoil.
    let finishLoadingCards!: () => void;
    const cardsReady = new Promise<void>((resolve) => {
      finishLoadingCards = resolve;
    });
    await page.route(/\/assets\/CardsPage-[^/?]+\.js(?:\?|$)/, async (route) => {
      await cardsReady;
      await route.continue();
    });
    await openSeededCourse(page);
    const navigation = page.locator('nav[aria-label="Course sections"]:visible');
    const path = navigation.getByRole('link', { name: 'Path', exact: true });
    const cards = navigation.getByRole('link', { name: 'Cards', exact: true });
    const indicator = navigation.locator('[data-course-tab-indicator]');
    const centre = (node: Element) => {
      const box = node.getBoundingClientRect();
      return box.x + box.width / 2;
    };
    const start = (await path.boundingBox())!;
    const startX = await path.evaluate(centre);
    const targetX = await cards.evaluate(centre);
    const releaseX = Math.round(startX + (targetX - startX) * 0.7);
    const y = Math.round(start.y + start.height / 2);
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(startX), y }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: releaseX, y }],
    });
    await expect
      .poll(async () => Math.abs((await indicator.evaluate(centre)) - releaseX))
      .toBeLessThan(2);
    await expect(path).toHaveAttribute('aria-current', 'page');

    const frames = await navigation.evaluateHandle((nav) => ({
      finished: new Promise<number[]>((resolve) => {
        window.addEventListener(
          'pointerup',
          () => {
            const started = performance.now();
            const positions: number[] = [];
            function sample() {
              const box = nav.querySelector('[data-course-tab-indicator]')?.getBoundingClientRect();
              positions.push(box ? box.x + box.width / 2 : NaN);
              if (performance.now() - started >= 250) resolve(positions);
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          },
          { once: true, capture: true },
        );
      }),
    }));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const positions = await frames.evaluate((result) => result.finished);
    await expect(path).toHaveAttribute('aria-current', 'page');
    finishLoadingCards();
    await frames.dispose();
    await touch.detach();

    expect(positions.length).toBeGreaterThan(1);
    expect(Math.min(...positions), JSON.stringify(positions)).toBeGreaterThan(releaseX - 2);
    expect(Math.max(...positions), JSON.stringify(positions)).toBeGreaterThan(releaseX + 2);
    expect(Math.max(...positions), JSON.stringify(positions)).toBeLessThan(targetX + 2);
    await expect(page).toHaveURL(/\/cards$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome to Lacuna', exact: true }),
    ).toHaveCount(0);
    await expect(navigation).toHaveCount(1);
    await expect(cards).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(async () => Math.abs((await indicator.evaluate(centre)) - targetX))
      .toBeLessThan(2);
    await cards.press('ArrowRight');
    await expect(page).toHaveURL(/\/questions$/);
  });
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
