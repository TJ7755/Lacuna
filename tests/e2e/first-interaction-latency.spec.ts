import { expect, test, type Page, type Request } from '@playwright/test';
import { measurePointerInteraction } from './fixtures/interactionPerformance';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

const CHUNK_DELAY_MS = 400;
const CARDS_CHUNK = /\/assets\/CardsPage-[^/?]+\.js(?:\?|$)/;
const CARDS_ACKNOWLEDGEMENT = {
  selector:
    'nav[aria-label="Course sections"]:has(a[aria-label="Cards"][aria-current="page"]) [data-course-tab-indicator]',
};
const CARDS_MEANINGFUL = { selector: 'main h1', text: 'Cards' };

test.use({ trace: 'off', video: 'off', serviceWorkers: 'block' });

test('prefetches the Cards chunk before the first intended click', async ({ page }, testInfo) => {
  let cardsChunkRequest: Request | undefined;
  await page.route(CARDS_CHUNK, async (route) => {
    cardsChunkRequest = route.request();
    await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    await route.continue();
  });

  await openSeededCourse(page);
  const cards = page
    .locator('nav[aria-label="Course sections"]:visible')
    .getByRole('link', { name: 'Cards', exact: true });

  await cards.hover();
  await cards.focus();
  await page.waitForFunction(
    (pattern) =>
      performance
        .getEntriesByType('resource')
        .some((entry) => new RegExp(pattern).test(entry.name)),
    CARDS_CHUNK.source,
    { timeout: 5_000 },
  );
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __cardsPointerDownAt?: number };
    window.addEventListener(
      'pointerdown',
      () => {
        state.__cardsPointerDownAt = performance.now();
      },
      { capture: true, once: true },
    );
  });

  const interaction = await measurePointerInteraction({
    page,
    trigger: cards,
    acknowledgement: CARDS_ACKNOWLEDGEMENT,
    meaningful: CARDS_MEANINGFUL,
  });
  const timing = await page.evaluate((chunkPattern) => {
    const state = globalThis as typeof globalThis & { __cardsPointerDownAt?: number };
    const cardsResource = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((entry) => new RegExp(chunkPattern).test(entry.name))
      .at(-1);
    return {
      pointerDownAt: state.__cardsPointerDownAt ?? null,
      chunkResponseEnd: cardsResource?.responseEnd ?? null,
    };
  }, CARDS_CHUNK.source);

  await testInfo.attach('first-interaction-latency.json', {
    body: Buffer.from(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          injectedChunkDelayMs: CHUNK_DELAY_MS,
          cardsChunkRequested: cardsChunkRequest !== undefined,
          chunkResponseEnd: timing.chunkResponseEnd,
          pointerDownAt: timing.pointerDownAt,
          interaction,
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
    contentType: 'application/json',
  });

  expect(cardsChunkRequest, 'the Cards route should request its own chunk').toBeDefined();
  expect(timing.pointerDownAt).not.toBeNull();
  expect(timing.chunkResponseEnd).not.toBeNull();
  expect(
    timing.chunkResponseEnd,
    'the delayed Cards chunk should finish before pointerdown',
  ).toBeLessThan(timing.pointerDownAt ?? 0);
});

async function openSeededCourse(page: Page): Promise<void> {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome to Lacuna', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    false,
  );
}
