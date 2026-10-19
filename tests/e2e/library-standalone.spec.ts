import { expect, test } from '@playwright/test';

test.skip(process.env.LACUNA_BROWSER_SITE !== 'library', 'Run verify:browser -- --library');

const courses = [
  ['Biology', '6fb10671c70197caeff8616f80697ac5'],
  ['Chemistry', 'daf16de2b88b97fa236948559ede6c4c'],
  ['Physics', '52fe58acd2fcece40c1d10ffbf08276f'],
  ['History', '31178fee8489ffcf1748c1dc5c570be5'],
] as const;

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
    await expect(page).toHaveTitle('Library · Lacuna');
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
    await expect(page.getByText('Curated courses, built around your syllabus.')).toBeVisible();
    await expect(page.getByText('Preview course', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Previewing course', { exact: true })).toHaveCount(0);
    const homeTarget = await page.getByRole('link', { name: 'Lacuna home' }).boundingBox();
    expect(homeTarget?.height).toBeGreaterThanOrEqual(44);
    for (const [subject, code] of courses) {
      const button = page.getByRole('button', { name: new RegExp(subject) });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('heading', { level: 2, name: subject, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in Lacuna', exact: true })).toHaveAttribute(
        'href',
        `https://getlacuna.app/#/s/${code}`,
      );
      await expect(page.getByText('Review in progress', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Earlier terms reviewed; newer additions are awaiting review.'),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: /Biology/ }).click();
    await expect(page.getByText('1,322', { exact: true })).toBeVisible();
    await expect(page.getByText('164', { exact: true })).toBeVisible();
    await expect(page.getByText('Reviewed', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('library-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await expect(page.locator('html')).toHaveClass('dark');
    await page.screenshot({ path: info.outputPath('library-dark.png'), fullPage: true });
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

    // Navigation enters the existing share route; the library never imports the course itself.
    await page.route('https://getlacuna.app/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Lacuna share entry</title>',
      }),
    );
    await page.getByRole('link', { name: 'Open in Lacuna', exact: true }).click();
    await expect(page).toHaveURL('https://getlacuna.app/#/s/6fb10671c70197caeff8616f80697ac5');
  });
}
