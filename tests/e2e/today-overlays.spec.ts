import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna, importWelcomeCourse, openImport } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/films/')
      ? route.continue()
      : route.fulfill({ status: 204, body: '' });
  });
});

test('short Today creation and import show their initial choices without scrolling', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await settle(form);
  for (const name of ['Create', 'Cancel'])
    await expect(form.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openImport(page);
  const lastSource = page.getByRole('button', { name: /Join a class/ });
  await settle(lastSource);
  await expect(lastSource).toBeInViewport({ ratio: 1 });
});

test('an open course menu stays usable after the desktop window narrows', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 956 });
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  await page.getByRole('button', { name: 'More for Welcome to Lacuna' }).click();
  const archive = page.getByRole('menuitem', { name: 'Archive', exact: true });
  await expect(archive).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 720 });
  await expect(archive).toBeInViewport({ ratio: 1 });
  await archive.click();
  await expect(page.getByRole('dialog', { name: 'Archive Welcome to Lacuna?' })).toBeVisible();
});

test('course actions remain usable when an optional action download fails', async ({ page }) => {
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  await page.route('**/assets/CourseActions-*.js', (route) => route.abort());
  await page.reload();
  const more = page.getByRole('button', { name: 'More for Welcome to Lacuna' });
  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toBeVisible();
  await page.locator('.today-forecast').click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('an expanded multi-course forecast fits its surface in a short desktop window', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  const template = readFileSync(
    new URL('./fixtures/welcome-course.lacuna', import.meta.url),
    'utf8',
  );
  for (const [index, name] of ['Biology', 'Chemistry', 'Physics', 'Mathematics'].entries()) {
    const file = JSON.parse(template);
    file.payload.course.n = name;
    file.payload.course.e = Date.now() + (index + 1) * 7 * 86400000;
    for (const exam of file.payload.exams) exam.e = file.payload.course.e;
    await openImport(page);
    await page.getByLabel('Import file', { exact: true }).setInputFiles({
      name: 'Synthetic.lacuna',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
    await page
      .getByRole('radio', { name: /Exam date/ })
      .locator('..')
      .click();
    await page.getByRole('button', { name: 'Add to my courses' }).click();
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  }
  await page
    .getByRole('list', { name: 'Courses', exact: true })
    .getByRole('button', { name: '2 more', exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator('.today-forecast-chart')
        .evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeLessThanOrEqual(1);
  const plot = page.getByRole('img', { name: 'Exam-day forecast', exact: true });
  await expect(plot).toBeVisible();
  const surface = await page.locator('.today-forecast').boundingBox();
  const bounds = await plot.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(surface!.y);
  expect(bounds!.y + bounds!.height).toBeLessThan(surface!.y + surface!.height);
});
