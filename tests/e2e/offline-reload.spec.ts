import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      message: 'the production service worker to control the page',
      timeout: 10_000,
    })
    .toBe(true);
}

async function cachedAssetPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths = await Promise.all(
      (await caches.keys()).map(async (name) => {
        const cache = await caches.open(name);
        return Promise.all(
          (await cache.keys()).map(async (request) => {
            const response = await cache.match(request);
            return response?.ok ? new URL(request.url).pathname : null;
          }),
        );
      }),
    );
    return paths.flat().filter((path): path is string => path !== null);
  });
}

async function expectCardsRouteCached(page: Page) {
  await expect
    .poll(() => cachedAssetPaths(page), {
      message:
        'the visited Cards route and its lazy Markdown stylesheet to remain in Cache Storage',
    })
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\/assets\/CardsPage-[A-Za-z0-9_-]{8}\.js$/),
        expect.stringMatching(/^\/assets\/markdown-[A-Za-z0-9_-]{8}\.css$/),
      ]),
    );
}

test('reloads a visited card library with persisted data while offline', async ({
  playwright,
}, testInfo) => {
  const identity = `${testInfo.workerIndex}-${Date.now()}`;
  const courseName = `Offline course ${identity}`;
  const front = `Offline card marker ${identity}`;
  const searchMiss = `Absent offline marker ${identity}`;
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('The web test project requires a base URL.');

  // Clearing Chromium's HTTP cache is browser-global. A dedicated process keeps
  // this proof hermetic when the rest of the web suite runs in parallel in CI.
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await enterFreshLacuna(page);
    await waitForServiceWorkerControl(page);
    await createCourse(page, courseName);

    await page.getByRole('button', { name: 'Author mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).click();
    await page.getByRole('textbox', { name: 'Front' }).fill(front);
    await page.getByRole('textbox', { name: 'Back' }).fill(`Answer for ${identity}`);
    await page.getByRole('button', { name: 'Add card', exact: true }).click();

    await page
      .getByRole('navigation', { name: 'Course sections' })
      .getByRole('link', { name: 'Cards' })
      .click();
    const cardsMain = page.locator('main[data-route-path$="/cards"]');
    await expect(cardsMain.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible();
    await expect(cardsMain.getByText(front, { exact: true })).toHaveCount(1);
    await expect(cardsMain.getByText(front, { exact: true })).toBeVisible();
    const cardsUrl = page.url();

    await expectCardsRouteCached(page);

    const devtools = await context.newCDPSession(page);
    await devtools.send('Network.enable');
    await devtools.send('Network.clearBrowserCache');
    await expectCardsRouteCached(page);

    try {
      await context.setOffline(true);
      await expect
        .poll(() => page.evaluate(() => navigator.onLine), {
          message: 'Chromium to expose the context as offline before reload',
        })
        .toBe(false);
      await expectCardsRouteCached(page);
      await page.reload({ waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(cardsUrl);
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      await expect(cardsMain.getByRole('heading', { name: 'Cards', level: 1 })).toBeVisible();
      await expect(cardsMain.getByText(front, { exact: true })).toBeVisible();

      const search = cardsMain.getByPlaceholder('Search all cards…');
      await search.fill(searchMiss);
      await expect(cardsMain.getByText(/No cards match/)).toBeVisible();
      await search.clear();
      await expect(cardsMain.getByText(front, { exact: true })).toBeVisible();
      await expectCardsRouteCached(page);
    } finally {
      await context.setOffline(false);
      await devtools.detach();
    }
  } finally {
    await browser.close();
  }
});
