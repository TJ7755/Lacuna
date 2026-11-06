import { expect, test, type Page } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

async function observeForecastWork(page: Page) {
  const observe = () => {
    const observed = { historyReads: 0, workers: 0, terminated: 0 };
    Object.assign(window, { forecastWork: observed });
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'reviewHistory') observed.historyReads++;
      return getAll.apply(this, args);
    };
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      private forecast: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.forecast = options?.name === 'forecast-history';
        if (this.forecast) observed.workers++;
      }
      terminate() {
        if (this.forecast) observed.terminated++;
        super.terminate();
      }
    };
  };
  await page.addInitScript(observe);
  await page.evaluate(observe);
}

for (const failWorker of [false, true]) {
  test(`Today draws its real forecast ${failWorker ? 'when the worker chunk is unavailable' : 'without loading review rows on the renderer'}`, async ({
    page,
  }) => {
    await enterWithWelcomeCourse(page);
    await observeForecastWork(page);
    if (failWorker)
      await page.route('**/assets/remainingWork.worker-*.js', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Study Welcome to Lacuna' })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Exam-day forecast', exact: true })).toBeVisible();
    const work = await page.evaluate(
      () =>
        Reflect.get(window, 'forecastWork') as {
          historyReads: number;
          workers: number;
          terminated: number;
        },
    );
    expect(work.workers).toBeGreaterThan(0);
    expect(work.terminated).toBe(work.workers);
    expect(work.historyReads).toBe(failWorker ? 1 : 0);
  });
}

for (const destination of ['course', 'search'] as const) {
  test(`opening ${destination} cancels a held forecast worker while Study stays usable`, async ({
    page,
  }) => {
    await enterWithWelcomeCourse(page);
    await observeForecastWork(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route('**/assets/remainingWork.worker-*.js', async (route) => {
      requested = true;
      await held;
      await route.abort();
    });
    try {
      await page.reload();
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole('button', { name: 'Study Welcome to Lacuna' })).toBeEnabled();
      if (destination === 'search') {
        await page.keyboard.press('ControlOrMeta+k');
        await expect(page.getByRole('combobox')).toBeVisible();
      } else {
        await page
          .getByRole('region', { name: 'Today, most urgent first' })
          .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
          .click();
        await expect(page).toHaveURL(/#\/course\/[^/]+$/);
      }
      await expect
        .poll(() =>
          page.evaluate(() => {
            const work = Reflect.get(window, 'forecastWork') as {
              workers: number;
              terminated: number;
            };
            return work.workers > 0 && work.workers === work.terminated;
          }),
        )
        .toBe(true);
      release();
      expect(await page.evaluate(() => Reflect.get(window, 'forecastWork').historyReads)).toBe(0);
      if (destination === 'search') {
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('img', { name: 'Exam-day forecast', exact: true }),
        ).toBeVisible();
      }
    } finally {
      release();
    }
  });
}

test('cached Today keeps its forecast when first opening the optional calculation offline', async ({
  playwright,
}, testInfo) => {
  // This case also starts and closes a dedicated browser; interaction budgets are separate.
  test.setTimeout(60_000);
  // HTTP cache clearing is browser-global; isolate this offline proof from other specs.
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await enterWithWelcomeCourse(page);
    await expect(page.getByRole('img', { name: 'Exam-day forecast', exact: true })).toBeVisible();
    await observeForecastWork(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (/\/(?:remainingWork\.worker|forecastHistoryData)-/.test(request.url))
            await cache.delete(request);
        }
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Today', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Study Welcome to Lacuna' })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Exam-day forecast', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'forecastWork').historyReads)).toBe(1);
  } finally {
    await browser.close();
  }
});
