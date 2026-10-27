import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna, importWelcomeCourse, openImport } from './fixtures/lacunaApp';
import { contentRect as labelGeometry } from './fixtures/flowEvidence';

const evidence = process.env.LACUNA_TODAY_EVIDENCE ?? '/tmp/lacuna-today-candidate2';
test.use({
  serviceWorkers: 'block',
  viewport: { width: 1470, height: 956 },
  video: 'on',
  locale: 'en-GB',
  timezoneId: 'Europe/London',
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/films/')
      ? route.continue()
      : route.fulfill({ status: 204, body: '' });
  });
});

test('cold Study acknowledges input and Escape cancels before the chunk arrives', async ({
  page,
}) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/assets/StudySheet-*.js', async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await enterFreshLacuna(page);
    await importWelcomeCourse(page);
    const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
    await study.click();
    await expect.poll(() => requested).toBe(true);
    await expect(study).toHaveAttribute('aria-busy', 'true');
    const pending = page.getByRole('status', { name: 'Loading study options' });
    await expect(pending).toBeVisible();
    expect((await pending.boundingBox())!.height).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: `${evidence}/study-pending.png` });
    await page.keyboard.press('Escape');
    await expect(study).not.toHaveAttribute('aria-busy');
    release();
    await page.waitForTimeout(900);
    await expect(page.getByRole('region', { name: 'Session preview' })).toBeHidden();
    await expect(study).toBeFocused();
    await study.press('Enter');
    await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
    await page.screenshot({ path: `${evidence}/today-session-preview-1470.png` });
    await page.keyboard.press('Escape');
  } finally {
    release();
  }
});

test('Study fills the viewport through resize and Escape cancels its pending destination', async ({
  page,
}, testInfo) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/LearnMode-*.js', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await enterFreshLacuna(page);
    await importWelcomeCourse(page);
    await page.getByRole('button', { name: 'Study Welcome to Lacuna' }).click();
    await page
      .getByRole('region', { name: 'Session preview' })
      .getByRole('button', { name: 'Start session', exact: true })
      .first()
      .click();
    const cover = page.getByTestId('study-cover');
    await expect(cover).toBeVisible();
    const surface = cover.locator('.flow-surface');
    await expect
      .poll(() => surface.boundingBox())
      .toEqual({ x: 0, y: 0, width: 1470, height: 956 });
    await page.setViewportSize({ width: 2000, height: 1159 });
    await expect
      .poll(() => surface.boundingBox())
      .toEqual({ x: 0, y: 0, width: 2000, height: 1159 });
    await testInfo.attach('study-cover-full-viewport', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(cover).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
    release();
    await page.waitForTimeout(900);
    await expect(cover).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('button', { name: 'Study Welcome to Lacuna' })).toBeEnabled();
  } finally {
    release();
  }
});

test('forecast arrival keeps actionable queue coordinates and failed chunks recover', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failedUrl = '';
  await page.route('**/assets/ForecastChart-*.js', async (route) => {
    failedUrl = route.request().url();
    await gate;
    await route.abort();
  });
  try {
    await enterFreshLacuna(page);
    await importWelcomeCourse(page);
    const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
    await expect(study).toBeEnabled();
    await page.waitForTimeout(750);
    const before = await study.boundingBox();
    expect(before!.y + before!.height).toBeLessThanOrEqual(600);
    await page.screenshot({ path: `${evidence}/forecast-pending.png` });
    release();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Could not load forecast.' }),
    ).toBeVisible();
    await page.screenshot({ path: `${evidence}/forecast-failed.png` });
    const fetched: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('ForecastChart')) fetched.push(request.url());
    });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Exam-day forecast', exact: true })).toBeVisible();
    await page.waitForTimeout(650);
    const after = await study.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(fetched.some((url) => url !== failedUrl && url.includes('ForecastChart'))).toBe(true);
    await page.screenshot({ path: `${evidence}/forecast-recovered.png` });
  } finally {
    release();
  }
});

test('Today surfaces keep labels pinned through hover, press, reversal and reduced motion', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.screenshot({ path: `${evidence}/today-empty-1470.png` });
  const create = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  await create.hover();
  await page.waitForTimeout(400);
  const before = await labelGeometry(create);
  await page.mouse.down();
  await page.waitForTimeout(110);
  expect(await labelGeometry(create)).toEqual(before);
  await page.screenshot({ path: `${evidence}/new-course-pressed.png` });
  await page.mouse.up();
  const form = page.getByRole('form', { name: 'New course' });
  const input = form.getByRole('textbox', { name: 'Course name' });
  await expect(input).toBeFocused();
  await page.keyboard.type('Immediate input');
  await expect(input).toHaveValue('Immediate input');
  await page.screenshot({ path: `${evidence}/new-course-expanding.png` });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${evidence}/today-new-course-1470.png` });
  await create.click();
  await page.waitForTimeout(75);
  await create.click({ force: true });
  await expect(input).toHaveValue('Immediate input');
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await create.press('Enter');
  await expect(input).toBeFocused();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.waitForTimeout(150);
  const first = await form
    .getByRole('radio', { name: /Exam date/ })
    .locator('..')
    .boundingBox();
  const second = await form
    .getByRole('radio', { name: /Steady retention/ })
    .locator('..')
    .boundingBox();
  expect(second!.y).toBeGreaterThan(first!.y);
  await page.screenshot({ path: `${evidence}/new-course-enlarged-reduced.png` });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await importWelcomeCourse(page);
  await expect(page.getByRole('img', { name: 'Exam-day forecast', exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${evidence}/today-welcome-course-1470.png` });
  const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const label = await labelGeometry(study);
  await study.hover();
  await page.waitForTimeout(180);
  expect(await labelGeometry(study)).toEqual(label);
  await page.mouse.down();
  await page.waitForTimeout(100);
  expect(await labelGeometry(study)).toEqual(label);
  await page.screenshot({ path: `${evidence}/study-pressed.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => study.evaluate((element) => getComputedStyle(element, '::before').transform))
    .toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Toggle colour theme' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${evidence}/today-welcome-course-dark-1470.png` });
});

test('mixed forecast horizons and legend selection have native keyboard parity', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  const file = JSON.parse(
    readFileSync(new URL('./fixtures/welcome-course.lacuna', import.meta.url), 'utf8'),
  );
  file.payload.course.n = 'Steady course';
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Steady course.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page
    .getByRole('radio', { name: /Steady retention/ })
    .locator('..')
    .click();
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('img', { name: 'Recall forecast', exact: true })).toBeVisible();
  const legend = page.getByRole('list', { name: 'Courses' });
  const course = legend.getByRole('button', { name: /Steady course/ });
  await course.focus();
  await page.keyboard.press('Enter');
  await expect(course).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await page.mouse.move(0, 0);
  await expect(course).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${evidence}/multi-course-selected.png` });
  await course.focus();
  await page.keyboard.press('Space');
  await expect(course).toHaveAttribute('aria-pressed', 'false');
});

test('cold reload shows actionable rows before optional motion features arrive', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route('**/assets/motionFeatures-*.js', async (route) => {
    held = true;
    await gate;
    await route.continue();
  });
  try {
    await page.reload();
    const study = page.getByRole('button', { name: 'Study Welcome to Lacuna' });
    await expect(study).toBeEnabled();
    await expect.poll(() => held).toBe(true);
    await expect
      .poll(() =>
        study.evaluate((element) => {
          let opacity = 1;
          for (let node: Element | null = element; node; node = node.parentElement)
            opacity *= Number(getComputedStyle(node).opacity);
          return opacity;
        }),
      )
      .toBe(1);
    const course = page
      .getByRole('navigation', { name: 'Courses', exact: true })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    await expect
      .poll(() =>
        course.evaluate((element) => {
          let opacity = 1;
          for (let node: Element | null = element; node; node = node.parentElement)
            opacity *= Number(getComputedStyle(node).opacity);
          return opacity;
        }),
      )
      .toBe(1);
    await page.screenshot({ path: `${evidence}/cold-reload-motion-pending.png` });
  } finally {
    release();
  }
});
