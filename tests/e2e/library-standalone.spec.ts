import { expect, test } from '@playwright/test';

test.skip(process.env.LACUNA_BROWSER_SITE !== 'library', 'Run verify:browser -- --library');

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
    const courseButtons = page.locator('button[aria-controls="library-preview"]');
    const courseCount = await courseButtons.count();
    expect(courseCount).toBeGreaterThan(0);
    for (let index = 0; index < courseCount; index += 1) {
      const button = courseButtons.nth(index);
      const subject = await button.locator('.library-course-subject').innerText();
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.locator('button[aria-controls="library-preview"][aria-pressed="true"]'),
      ).toHaveCount(1);
      await expect(
        page.getByRole('heading', { level: 2, name: subject, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in Lacuna', exact: true })).toHaveAttribute(
        'href',
        /^https:\/\/getlacuna\.app\/#\/s\/[0-9a-f]{32}$/,
      );
    }
    await courseButtons.first().click();
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

    const courseLink = page.getByRole('link', { name: 'Open in Lacuna', exact: true });
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
