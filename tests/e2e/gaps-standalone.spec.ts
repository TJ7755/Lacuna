import { expect, test } from '@playwright/test';
import { openSidebarItem } from './fixtures/gaps';

test.skip(
  process.env.LACUNA_BROWSER_SITE !== 'gaps',
  'Run verify:browser -- --gaps for the separate teacher build',
);

for (const width of [1280, 390]) {
  test(`standalone Gaps has no learner startup at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    const requests: { url: string; type: string }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) =>
      requests.push({ url: request.url(), type: request.resourceType() }),
    );
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.defineProperty(window, '__teacherStartupCalls', { value: calls });
      for (const name of ['open', 'deleteDatabase'] as const) {
        const original = indexedDB[name].bind(indexedDB);
        Object.defineProperty(indexedDB, name, {
          value: (...args: Parameters<typeof original>) => {
            calls.push(`indexedDB.${name}:${String(args[0])}`);
            return Reflect.apply(original, indexedDB, args);
          },
        });
      }
      const originalWorker = window.Worker;
      window.Worker = class extends originalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          calls.push(`Worker:${String(url)}`);
          super(url, options);
        }
      };
      for (const name of ['register', 'getRegistrations'] as const) {
        const original = navigator.serviceWorker[name].bind(navigator.serviceWorker);
        Object.defineProperty(navigator.serviceWorker, name, {
          value: (...args: unknown[]) => {
            calls.push(`serviceWorker.${name}`);
            return Reflect.apply(original, navigator.serviceWorker, args);
          },
        });
      }
      const originalFetch = window.fetch;
      window.fetch = (...args) => {
        calls.push(`fetch:${String(args[0])}`);
        return originalFetch(...args);
      };
      localStorage.setItem('existing-teacher-data', 'keep');
      localStorage.setItem('lacuna-ai-settings', '{"enabled":true}');
    });

    await page.goto('/?source=trial');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Teacher keys' })).toHaveCount(0);
    await expect(page).toHaveTitle('Gaps · Lacuna');
    await expect(page.getByRole('link', { name: 'Open Share in Lacuna' })).toHaveAttribute(
      'href',
      'https://getlacuna.app/#/share',
    );
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('gaps-home.png'), fullPage: true });
    await openSidebarItem(page, 'About Gaps');
    await expect(page.getByRole('heading', { name: 'About Gaps', level: 1 })).toBeFocused();
    const about = page.getByRole('main');
    await expect(about.getByRole('link', { name: 'School data notice' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md',
    );
    await expect(about).toContainText('no report does not mean no study');
    await page.screenshot({ path: testInfo.outputPath('gaps-about.png'), fullPage: true });

    // Legacy learner links must remain teacher-only on this build, including reloads.
    await page.goto('/#/share');
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
    const state = await page.evaluate(async () => ({
      calls: (window as unknown as { __teacherStartupCalls: string[] }).__teacherStartupCalls,
      databases: await indexedDB.databases(),
      registrations: await navigator.serviceWorker.getRegistrations(),
      cacheNames: await caches.keys(),
      storage: { ...localStorage },
      fits: document.documentElement.scrollWidth <= innerWidth,
    }));
    expect(
      state.calls.filter(
        (call) =>
          !['indexedDB.open:lacuna.gaps.connections', 'serviceWorker.getRegistrations'].includes(
            call,
          ),
      ),
    ).toEqual([]);
    expect(state.calls).toContain('indexedDB.open:lacuna.gaps.connections');
    expect(state.databases).toEqual([{ name: 'lacuna.gaps.connections', version: 10 }]);
    expect(state.registrations).toEqual([]);
    expect(state.cacheNames).toEqual([]);
    expect(state.storage).toEqual({
      'existing-teacher-data': 'keep',
      'lacuna-ai-settings': '{"enabled":true}',
      'lacuna-theme': 'dark',
    });
    expect(state.fits).toBe(true);
    expect(requests.filter((request) => ['fetch', 'xhr', 'worker'].includes(request.type))).toEqual(
      [],
    );
    expect(
      requests.every((request) => new URL(request.url).origin === new URL(page.url()).origin),
    ).toBe(true);
    expect(errors).toEqual([]);
    await testInfo.attach('startup-state', {
      body: JSON.stringify({ state, requests }, null, 2),
      contentType: 'application/json',
    });
  });
}

test('standalone Gaps leaves existing learner storage intact', async ({ page }) => {
  await page.route('**/retained-state', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Storage fixture</title>' }),
  );
  await page.goto('/retained-state');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('courses');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('courses', 'readwrite');
        transaction.objectStore('courses').put({ name: 'Existing teacher course' }, 'keep');
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const cache = await caches.open('existing-study-cache');
    await cache.put('/stored-course', new Response('Keep this course'));
    localStorage.setItem('lacuna-seeded', '1');
  });
  await page.goto('/#/teach');
  await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
  expect(
    await page.evaluate(async () => ({
      databases: await indexedDB.databases(),
      cache: await (await caches.match('/stored-course'))?.text(),
      seeded: localStorage.getItem('lacuna-seeded'),
    })),
  ).toEqual({
    databases: [
      { name: 'lacuna', version: 1 },
      { name: 'lacuna.gaps.connections', version: 10 },
    ],
    cache: 'Keep this course',
    seeded: '1',
  });
});

test('uses Lacuna’s saved light theme and supports keyboard connection entry at 390px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  // With no classes the form is already on the page; the sidebar's shortcut focuses it.
  const link = page.getByLabel('Course link or code');
  await expect(link).toBeVisible();
  await openSidebarItem(page, 'Connect a class');
  await expect(link).toBeFocused();
  await page.getByRole('button', { name: 'Use a connection file' }).click();
  const form = page.getByRole('form', { name: 'Connect a class' });
  await expect(form.getByLabel('Connection file')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('Connection passphrase', { exact: true })).toBeFocused();
  await form.getByLabel('Connection passphrase', { exact: true }).fill('temporary phrase');
  await page.screenshot({
    path: testInfo.outputPath('gaps-connect-light-mobile.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('closes mobile navigation when widening into the desktop layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
  const nav = page.getByRole('complementary', { name: 'Gaps' });
  await nav.getByRole('button', { name: 'About Gaps' }).click();
  await expect(page.getByRole('heading', { name: 'About Gaps', level: 1 })).toBeFocused();
});
