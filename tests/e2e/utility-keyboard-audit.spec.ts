import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(`${request.url()} ${request.failure()?.errorText}`),
  );
});
test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('browser-errors', {
    body: JSON.stringify(browserErrors.get(page) ?? []),
    contentType: 'application/json',
  });
});

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 20; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('Search and Share keep the same page-frame left edge', async ({ page }) => {
  await enterFreshLacuna(page);
  await page.goto('/#/share');
  const share = page.getByRole('heading', { level: 1, name: 'Share', exact: true });
  await expect(share).toBeVisible({ timeout: 15000 });
  const shareLeft = (await share.boundingBox())!.x;
  await page.goto('/#/search');
  const search = page.getByRole('heading', { level: 1, name: 'Search content', exact: true });
  await expect(search).toBeVisible();
  expect(Math.abs((await search.boundingBox())!.x - shareLeft)).toBeLessThanOrEqual(1);
});

test('Search names its field, provides full-size keyboard filters and keeps Clear focus', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  await page.goto('/#/search');
  const search = page.getByRole('textbox', { name: 'Search content', exact: true });
  await expect(search).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Search everything' })).toHaveCount(0);
  await search.press('Tab');
  const due = page.getByRole('button', { name: 'Due now', exact: true });
  await expect(due).toBeFocused();
  await due.press('Space');
  await expect(due).toHaveAttribute('aria-pressed', 'true');
  for (const label of ['Due now', 'New', 'Leeches', 'Flagged', 'Suspended']) {
    const filter = page.getByRole('button', { name: label, exact: true });
    await expect
      .poll(async () => Math.round((await filter.boundingBox())!.height), { message: label })
      .toBeGreaterThanOrEqual(44);
  }
  const clear = page.getByRole('button', { name: 'Clear', exact: true });
  await tabTo(page, clear);
  await clear.press('Enter');
  await expect(search).toBeFocused();
  await expect(due).toHaveAttribute('aria-pressed', 'false');
  await search.fill('Welcome to Lacuna');
  const course = page
    .locator('main')
    .getByRole('button', { name: /^Welcome to Lacuna/ })
    .first();
  await expect(course).toBeVisible();
  await expect.poll(() => course.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await page.screenshot({ path: testInfo.outputPath('search-results.png') });
  await course.focus();
  await course.press('Enter');
  await expect(page).toHaveURL(/#\/course\//);
});

test('Import keeps its heading still and returns keyboard focus to the chosen source', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  await page.goto('/#/import');
  const heading = page.getByRole('heading', { level: 1, name: 'Import', exact: true });
  await expect(heading).toBeVisible();
  const headingTop = () =>
    heading.evaluate(
      (element) => element.getBoundingClientRect().top + (element.closest('main')?.scrollTop ?? 0),
    );
  const originalTop = await headingTop();
  const source = page.getByRole('button', { name: /Text or spreadsheet/ });
  await source.focus();
  await source.press('Enter');
  const paste = page.getByRole('textbox', { name: 'Paste your cards', exact: true });
  await expect(paste).toBeFocused();
  const inputBody = page.locator('.card-import-body').filter({ has: paste });
  expect(
    (await paste.boundingBox())!.width / (await inputBody.boundingBox())!.width,
  ).toBeGreaterThan(0.85);
  expect(Math.abs((await headingTop()) - originalTop)).toBeLessThanOrEqual(1);
  await paste.press('Escape');
  await expect(source).toBeFocused();
  await source.press('Enter');
  await expect(paste).toBeFocused();
  await paste.fill('A draft worth keeping');
  await paste.press('Escape');
  await expect(paste).toHaveValue('A draft worth keeping');
  await expect(page.locator('main [inert]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('import-text.png') });
  const back = page.getByRole('button', { name: 'Back to import sources', exact: true });
  await back.focus();
  await back.press('Enter');
  await expect(source).toBeFocused();
  expect(Math.abs((await headingTop()) - originalTop)).toBeLessThanOrEqual(1);
});

test('restoring the last archived course returns keyboard focus to Archived', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  const more = page.getByRole('button', { name: 'More for Welcome to Lacuna', exact: true });
  await more.focus();
  await more.press('Enter');
  const archive = page.getByRole('menuitem', { name: 'Archive', exact: true });
  await expect(archive).toBeFocused();
  await archive.press('Enter');
  const confirm = page.getByRole('button', { name: 'Archive course', exact: true });
  await expect(confirm).toBeFocused();
  await confirm.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/archived');
  const restore = page.getByRole('button', { name: 'Unarchive Welcome to Lacuna', exact: true });
  await expect(restore).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('archived-course.png') });
  await restore.focus();
  await restore.press('Enter');
  await expect(restore).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Archived', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'No archived courses' })).toBeVisible();
});

test('Share course choices and local share-code output work entirely from the keyboard', async ({
  page,
}, testInfo) => {
  await page.route('https://**/*', (route) => route.abort());
  await enterFreshLacuna(page);
  const newCourse = page.locator('main').getByRole('button', { name: 'New course', exact: true });
  await newCourse.focus();
  await newCourse.press('Enter');
  const form = page.getByRole('form', { name: 'New course', exact: true });
  await form.getByRole('textbox', { name: 'Course name', exact: true }).fill('Keyboard sharing');
  const retention = form.getByRole('radio', { name: /Steady retention/ });
  await retention.focus();
  await retention.press('Space');
  await form.getByRole('button', { name: 'Create', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#\/course\//);
  await page.goto('/#/share');
  await expect(page.getByRole('heading', { level: 1, name: 'Share', exact: true })).toBeVisible({
    timeout: 15000,
  });
  const choose = page.getByRole('button', { name: 'Course to share', exact: true });
  await expect(choose).toBeVisible();
  await choose.focus();
  await choose.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Course to share', exact: true });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(choose).toBeFocused();
  await expect(choose).toHaveAttribute('aria-expanded', 'false');
  await choose.press('ArrowDown');
  const welcome = menu.getByRole('menuitem', { name: /^Welcome to Lacuna/ });
  await welcome.focus();
  await welcome.press('Enter');
  await expect(choose).toBeFocused();
  await expect(choose).toHaveText(/Welcome to Lacuna/);
  const code = page.getByRole('button', { name: 'Share code', exact: true });
  await code.focus();
  await code.press('Enter');
  await expect(code).toHaveAttribute('aria-pressed', 'true');
  const generate = page.getByRole('button', { name: 'Create share code', exact: true });
  await expect(generate).toBeVisible();
  await tabTo(page, generate);
  await generate.press('Enter');
  const output = page.getByRole('textbox', { name: 'Generated share code', exact: true });
  await expect(output).toHaveValue(/\S+/);
  await expect(output).toBeFocused();
  expect(
    await output.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart,
    ),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('share-code.png') });
  await code.focus();
  await code.press('Enter');
  await expect(code).toHaveAttribute('aria-pressed', 'false');
  await expect(output).toHaveCount(0);
});
