import { expect, test, type Locator, type Page } from '@playwright/test';
import { LIBRARY_ORIGIN } from '../../src/config/origins';
import { libraryCourses } from '../../src/library/catalogue';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

const librarySelector = `a[href="${LIBRARY_ORIGIN}"]`;

async function checkLibraryLink(link: Locator) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(/\S/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/);
}

async function openLibrary(page: Page, link: Locator) {
  const originalUrl = page.url();
  await page
    .context()
    .route(`${LIBRARY_ORIGIN}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Library destination</h1>' }),
    );
  await link.focus();
  const opened = page.waitForEvent('popup');
  await link.press('Enter');
  const popup = await opened;
  await expect(popup).toHaveURL(`${LIBRARY_ORIGIN}/`);
  await expect(page).toHaveURL(originalUrl);
  await popup.close();
}

async function capture(page: Page, name: string, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `artifacts/library-links/${name}-${width}-after.png` });
}

for (const width of [1280, 390]) {
  test(`homepage exposes the library before and after hydration at ${width}px`, async ({
    page,
    request,
  }) => {
    const response = await request.get('/');
    expect(await response.text()).toContain(`href="${LIBRARY_ORIGIN}"`);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const navigation = page.getByRole('navigation').locator(librarySelector);
    await checkLibraryLink(navigation);
    await expect(navigation).toBeInViewport();
    await capture(page, 'homepage', width);
    await openLibrary(page, navigation);
  });

  test(`learner can discover courses from creation and import at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course' }).click();
    const form = page.getByRole('form', { name: 'New course' });
    await form.getByRole('textbox').fill('Unfinished course');
    const creation = form.locator(librarySelector);
    await checkLibraryLink(creation);
    await capture(page, 'new-course', width);
    await openLibrary(page, creation);
    await expect(form.getByRole('textbox')).toHaveValue('Unfinished course');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openImport(page);
    const importing = page.locator('.import-panel').locator(librarySelector);
    await checkLibraryLink(importing);
    await capture(page, 'import', width);
    await openLibrary(page, importing);
    await expect(page.locator('.import-panel')).toBeVisible();
    await page.goto('/#/import');
    await checkLibraryLink(importing);
  });

  test(`public course index and detail expose the library without JavaScript at ${width}px`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    for (const [name, path] of [
      ['courses', '/courses/'],
      ['course', `/courses/${libraryCourses[0].id}/`],
    ]) {
      await page.goto(`${test.info().project.use.baseURL}${path}`);
      await checkLibraryLink(page.getByRole('main').locator(librarySelector));
      await capture(page, name, width);
    }
    await context.close();
  });
}
