import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  measurePointerInteraction,
  summariseInteractionSamples,
  type InteractionPerformanceReport,
  type InteractionSample,
} from './fixtures/interactionPerformance';

const SAMPLE_COUNT = 5;
const SAFETY_CEILING_MS = 15_000;
const SETTINGS_ACKNOWLEDGEMENT = {
  selector: 'nav[aria-label="Primary navigation"] a[aria-current="page"]',
  text: 'Settings',
};
const SETTINGS_MEANINGFUL = { selector: 'main h1', text: 'Settings' };
const STUDY_ACKNOWLEDGEMENT = { selector: '[role="dialog"]' };
const STUDY_MEANINGFUL = { selector: '[role="dialog"] button', text: 'Welcome to Lacuna' };
const STUDY_SETTLED = { selector: '[role="dialog"]' };

interface BenchmarkSample extends InteractionSample {
  hoverMs?: number;
  prefetchObserved?: boolean;
}

interface BenchmarkReport extends Omit<
  InteractionPerformanceReport,
  'schemaVersion' | 'cold' | 'warm'
> {
  schemaVersion: 2;
  execution: 'sequential isolated contexts; browser process shared';
  hover: { samples: Array<{ hoverMs: number; prefetchObserved: boolean }> };
  cold: { samples: BenchmarkSample[]; summary: ReturnType<typeof summariseInteractionSamples> };
  warm: { samples: BenchmarkSample[]; summary: ReturnType<typeof summariseInteractionSamples> };
}

test.use({ trace: 'off', video: 'off' });
test.setTimeout(120_000);

test('records cold and warm sidebar Settings interaction timings', async ({
  browser,
}, testInfo) => {
  const cold: BenchmarkSample[] = [];
  const warm: BenchmarkSample[] = [];
  const hover: Array<{ hoverMs: number; prefetchObserved: boolean }> = [];
  const baseURL = String(testInfo.project.use.baseURL);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await openSeededDashboard(page);
      const settings = getSettingsLink(page);
      hover.push(await measureHover(settings, page, /\/assets\/[^/]*Settings[^/]*\.js/));
      await movePointerAway(page);
      cold.push(await measureSettingsNavigation(page));

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
      await movePointerAway(page);
      warm.push(await measureSettingsNavigation(page));
    } finally {
      await context.close();
    }
  }

  const report: BenchmarkReport = {
    schemaVersion: 2,
    execution: 'sequential isolated contexts; browser process shared',
    interaction: 'sidebar Settings navigation',
    motion: 'enabled',
    hover: { samples: hover },
    cold: { samples: cold, summary: summariseInteractionSamples(cold) },
    warm: { samples: warm, summary: summariseInteractionSamples(warm) },
  };
  await attachReport(testInfo, report);
  assertReport(report);
});

test('records first and repeat sidebar Study Sheet interaction timings', async ({
  browser,
}, testInfo) => {
  const cold: BenchmarkSample[] = [];
  const warm: BenchmarkSample[] = [];
  const baseURL = String(testInfo.project.use.baseURL);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await openSeededDashboard(page);
      await movePointerAway(page);
      cold.push(await measureStudySheet(page));
      await closeStudySheet(page);
      await movePointerAway(page);
      warm.push(await measureStudySheet(page));
    } finally {
      await context.close();
    }
  }

  const report: BenchmarkReport = {
    schemaVersion: 2,
    execution: 'sequential isolated contexts; browser process shared',
    interaction: 'sidebar Review today Study Sheet',
    motion: 'enabled',
    hover: { samples: [] },
    cold: { samples: cold, summary: summariseInteractionSamples(cold) },
    warm: { samples: warm, summary: summariseInteractionSamples(warm) },
  };
  await attachReport(testInfo, report);
  assertReport(report);
});

async function openSeededDashboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Study for the day that counts.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    false,
  );
}

function getSettingsLink(page: Page): Locator {
  return page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true });
}

async function measureSettingsNavigation(page: Page): Promise<BenchmarkSample> {
  const result = await measurePointerInteraction({
    page,
    trigger: getSettingsLink(page),
    acknowledgement: SETTINGS_ACKNOWLEDGEMENT,
    meaningful: SETTINGS_MEANINGFUL,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return result;
}

async function measureStudySheet(page: Page): Promise<BenchmarkSample> {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const study = navigation.locator('button, a').filter({ hasText: /^(Review today|Study now)$/ });
  await study.hover();
  await movePointerAway(page);
  return measurePointerInteraction({
    page,
    trigger: study,
    acknowledgement: STUDY_ACKNOWLEDGEMENT,
    meaningful: STUDY_MEANINGFUL,
    settled: STUDY_SETTLED,
  });
}

async function measureHover(
  trigger: Locator,
  page: Page,
  prefetchPattern: RegExp,
): Promise<{ hoverMs: number; prefetchObserved: boolean }> {
  const startedAt = await page.evaluate(() => performance.now());
  const prefetch = page.waitForRequest(prefetchPattern, { timeout: 2_000 }).catch(() => undefined);
  await trigger.hover();
  const request = await prefetch;
  return {
    hoverMs: Math.round((await page.evaluate(() => performance.now())) - startedAt),
    prefetchObserved: request !== undefined,
  };
}

async function movePointerAway(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
}

async function closeStudySheet(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

function assertReport(report: BenchmarkReport): void {
  expect(report.cold.summary.sampleCount).toBe(SAMPLE_COUNT);
  expect(report.warm.summary.sampleCount).toBe(SAMPLE_COUNT);
  expect(report.cold.summary.acknowledgementMs.median).toBeGreaterThan(0);
  expect(report.warm.summary.acknowledgementMs.median).toBeGreaterThan(0);
  expect(report.cold.summary.meaningfulMs.p95).toBeLessThan(SAFETY_CEILING_MS);
  expect(report.warm.summary.meaningfulMs.p95).toBeLessThan(SAFETY_CEILING_MS);
  if (report.hover.samples.length > 0) {
    expect(report.hover.samples).toHaveLength(SAMPLE_COUNT);
    expect(report.hover.samples.every((sample) => sample.prefetchObserved)).toBe(true);
  }
  for (const sample of [...report.cold.samples, ...report.warm.samples]) {
    if (sample.settlementMs !== undefined) {
      expect(sample.settlementMs).toBeGreaterThanOrEqual(sample.meaningfulMs);
    }
  }
}

async function attachReport(testInfo: TestInfo, report: BenchmarkReport): Promise<void> {
  await testInfo.attach('interaction-performance.json', {
    body: Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}
