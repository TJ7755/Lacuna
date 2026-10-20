import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.skip(
  process.env.LACUNA_BROWSER_SITE !== 'gaps',
  'Run verify:browser -- --gaps for the teacher migration',
);

const legacyWorker = `
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open('legacy-study-cache');
  await cache.put('/', new Response('<h1>Cached learner shell</h1>', { headers: { 'Content-Type': 'text/html' } }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(caches.match('/'));
});
`;

test('retires a cached Gaps learner shell without touching courses or the main-site worker', async ({
  context,
  page,
  baseURL,
}, testInfo) => {
  const retirementWorker = await readFile(
    join(process.env.LACUNA_BROWSER_RUN_DIR!, 'dist/sw.js'),
    'utf8',
  );
  let teacherBuild = false;
  for (const origin of ['https://gaps.getlacuna.app', 'https://getlacuna.app']) {
    await context.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://getlacuna.app' || !teacherBuild) {
        await route.fulfill({
          contentType: url.pathname === '/sw.js' ? 'text/javascript' : 'text/html',
          body: url.pathname === '/sw.js' ? legacyWorker : '<h1>Legacy installation fixture</h1>',
        });
        return;
      }
      if (url.pathname === '/sw.js') {
        await route.fulfill({
          contentType: 'text/javascript',
          body: retirementWorker,
          headers: { 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' },
        });
        return;
      }
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
  }
  const main = await context.newPage();
  await main.goto('https://getlacuna.app/');
  await main.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.goto('https://gaps.getlacuna.app/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('courses');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('courses', 'readwrite');
        transaction.objectStore('courses').put('Existing teacher course', 'keep');
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto('https://gaps.getlacuna.app/#/teach');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cached learner shell' })).toBeVisible();
  teacherBuild = true;
  await page.evaluate(async () => {
    // Chromium's background update fetch bypasses Playwright routing. Changing only
    // the query lets the local candidate exercise replacement of the same root registration.
    await navigator.serviceWorker.register('/sw.js?gaps-retirement', { scope: '/' });
  });
  // The retirement worker refreshes only teacher home after dropping the old fetch handler.
  await expect(page.getByRole('heading', { name: 'Gaps', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
  await expect(page).toHaveTitle('Gaps · Lacuna');
  expect(
    await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      databases: await indexedDB.databases(),
      caches: await caches.keys(),
      course: await new Promise((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('courses').objectStore('courses').get('keep');
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    })),
  ).toEqual({
    registrations: 0,
    databases: [
      { name: 'lacuna', version: 1 },
      { name: 'lacuna.gaps.connections', version: 10 },
    ],
    caches: ['legacy-study-cache'],
    course: 'Existing teacher course',
  });
  expect(
    await main.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope),
    ),
  ).toEqual(['https://getlacuna.app/']);
  expect(await main.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(
    'https://getlacuna.app/sw.js',
  );
  await page.screenshot({
    path: testInfo.outputPath('gaps-after-worker-migration.png'),
    fullPage: true,
  });
});
