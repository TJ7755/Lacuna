import { expect, test, type Page } from '@playwright/test';
import { libraryCourses } from '../../apps/web/src/library/catalogue';

/** Waits until the page's layout stops moving, so screenshots show settled motion. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = '';
        let still = 0;
        const step = () => {
          const rects = [...document.querySelectorAll('section > *, [role="dialog"]')]
            .map((element) => JSON.stringify(element.getBoundingClientRect()))
            .join();
          still = rects === last ? still + 1 : 0;
          last = rects;
          if (still >= 10 && document.getAnimations().length === 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

test.skip(process.env.LACUNA_BROWSER_SITE !== 'library', 'Run verify:browser -- --library');

for (const width of [1280, 390, 320]) {
  test(`find Cambridge variants and retained History aliases at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'Search courses' });
    const covers = page.getByRole('region', { name: 'Courses' }).getByRole('button');
    for (const [subject, primary, alternative, shareId] of [
      ['History', '0977', '0470', '31178fee8489ffcf1748c1dc5c570be5'],
    ]) {
      for (const code of [primary, alternative]) {
        await search.fill(code);
        await expect(covers).toHaveCount(1);
        await expect(covers).toContainText(primary);
        await expect(covers).toContainText(alternative);
      }
      await covers.click();
      const sheet = page.getByRole('dialog', { name: subject });
      await expect(sheet).toContainText(primary);
      await expect(sheet).toContainText(alternative);
      await expect(
        sheet.getByRole('link', { name: 'Open in Lacuna', exact: true }),
      ).toHaveAttribute('href', `https://getlacuna.app/#/s/${shareId}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
    for (const code of ['0972', '0625']) {
      await search.fill(code);
      await expect(covers).toHaveCount(1);
      await expect(covers).toContainText(code);
      await covers.click();
      const sheet = page.getByRole('dialog', { name: 'Physics' });
      const course = libraryCourses.find((item) => item.code === code)!;
      await expect(
        sheet.getByRole('link', { name: 'Open in Lacuna', exact: true }),
      ).toHaveAttribute('href', course.shareUrl!);
      await page.keyboard.press('Escape');
    }
    await search.fill('  cAmBrIdGe 0625  ');
    await expect(covers).toHaveCount(1);
    await page.getByRole('radio', { name: 'Pearson Edexcel', exact: true }).click();
    await expect(covers).toHaveCount(0);
    await expect(page.getByRole('status')).toBeVisible();
    await page.getByRole('radio', { name: 'All', exact: true }).click();
    await expect(covers).toHaveCount(1);
    await search.fill('');
    await expect(covers).toHaveCount(libraryCourses.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const width of [1280, 390, 320]) {
  test(`browse and open courses without learner startup at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    const backgroundRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (['fetch', 'xhr', 'worker'].includes(request.resourceType()))
        backgroundRequests.push(request.url());
    });
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.defineProperty(window, '__libraryStartupCalls', { value: calls });
      for (const name of ['open', 'deleteDatabase'] as const) {
        const original = indexedDB[name].bind(indexedDB);
        Object.defineProperty(indexedDB, name, {
          value: (...args: Parameters<typeof original>) => {
            calls.push(`indexedDB.${name}`);
            return Reflect.apply(original, indexedDB, args);
          },
        });
      }
      const original = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args) => {
        calls.push('serviceWorker.register');
        return original(...args);
      };
      localStorage.setItem('retained-library-data', 'keep');
      localStorage.setItem('lacuna-theme', 'light');
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const homeTarget = await page.getByRole('link', { name: 'Lacuna home' }).boundingBox();
    expect(homeTarget?.height).toBeGreaterThanOrEqual(44);
    const covers = page
      .getByRole('region', { name: 'Courses', includeHidden: true })
      // An open cover hides beneath its sheet, so it stays addressable while hidden.
      .getByRole('button', { includeHidden: true });
    const courseCount = await covers.count();
    expect(courseCount).toBeGreaterThan(0);
    await expect(page.getByText(/review/i)).toHaveCount(0);
    await settle(page);
    await page.getByRole('radio', { name: 'Cambridge', exact: true }).click();
    await expect(covers).toHaveCount(
      libraryCourses.filter((course) => course.board === 'Cambridge').length,
    );
    await settle(page);
    await page.getByRole('radio', { name: 'All', exact: true }).click();
    await expect(covers).toHaveCount(courseCount);
    await settle(page);
    await page.screenshot({ path: info.outputPath('library-light.png'), fullPage: true });
    const sheet = page.getByRole('dialog');
    for (let index = 0; index < courseCount; index += 1) {
      const cover = covers.nth(index);
      await cover.focus();
      await page.keyboard.press('Enter');
      await expect(cover).toHaveAttribute('aria-expanded', 'true');
      await expect(sheet).toHaveCount(1);
      const subject = await sheet.getByRole('heading', { level: 2 }).innerText();
      await expect(cover).toContainText(subject);
      await expect(sheet).toHaveAccessibleName(subject);
      await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
      await page
        .getByRole('link', { name: 'Lacuna home', includeHidden: true })
        .evaluate((element) => (element as HTMLElement).focus());
      await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(sheet.getByRole('button', { name: 'Close course' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(sheet.getByRole('link', { name: 'Open in Lacuna', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(sheet.getByRole('textbox', { name: 'Item reference (optional)' })).toBeFocused();
      await page.keyboard.type('note: cells & tissues #3');
      await page.keyboard.press('Tab');
      const report = sheet.getByRole('link', { name: 'Report a mistake' });
      await expect(report).toBeFocused();
      const reportUrl = new URL((await report.getAttribute('href'))!);
      expect(reportUrl.origin + reportUrl.pathname).toBe(
        'https://github.com/TJ7755/Lacuna/issues/new',
      );
      expect([...reportUrl.searchParams.keys()]).toEqual(['title', 'body']);
      expect(reportUrl.searchParams.get('body')).toMatch(
        /^Course: [a-z0-9-]+\nRevision: \d+\nItem reference: note: cells & tissues #3$/,
      );
      await page.keyboard.press('Tab');
      await expect(sheet.getByRole('button', { name: 'Close course' })).toBeFocused();
      await expect(
        sheet.getByRole('link', { name: 'Open in Lacuna', exact: true }),
      ).toHaveAttribute('href', /^https:\/\/getlacuna\.app\/#\/s\/[0-9a-f]{32}$/);
      await expect(sheet.getByText(/review/i)).toHaveCount(0);
      // The sheet settles inside the viewport whatever the width.
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox();
          return box !== null && box.x >= 0 && box.x + box.width <= width;
        })
        .toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(cover).toBeFocused();
    }
    await covers.first().click();
    await expect(sheet).toHaveCount(1);
    await settle(page);
    await page.screenshot({ path: info.outputPath('library-light-open.png') });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await expect(page.locator('html')).toHaveClass('dark');
    await settle(page);
    await page.screenshot({ path: info.outputPath('library-dark.png'), fullPage: true });
    await covers.first().click();
    await expect(sheet).toHaveCount(1);
    await settle(page);
    await page.screenshot({ path: info.outputPath('library-dark-open.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { __libraryStartupCalls: string[] }).__libraryStartupCalls,
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('retained-library-data'))).toBe('keep');
    expect(backgroundRequests).toEqual([]);
    expect(errors).toEqual([]);

    const courseLink = sheet.getByRole('link', { name: 'Open in Lacuna', exact: true });
    const destination = await courseLink.getAttribute('href');
    expect(destination).not.toBeNull();

    // Navigation enters the existing share route; the library never imports the course itself.
    await page.route('https://getlacuna.app/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Lacuna share entry</title>',
      }),
    );
    await courseLink.click();
    await expect(page).toHaveURL(destination!);
  });
}

test('reduced motion keeps a complete course sheet without animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const cover = page.getByRole('region', { name: 'Courses' }).getByRole('button').first();
  await cover.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(sheet.getByRole('link', { name: 'Open in Lacuna', exact: true })).toBeInViewport();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(16);
  expect(box!.y).toBeGreaterThanOrEqual(16);
  expect(box!.x + box!.width).toBeLessThanOrEqual(304);
  expect(box!.y + box!.height).toBeLessThanOrEqual(624);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(cover).toBeFocused();
});
