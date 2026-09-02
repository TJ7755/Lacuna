import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  measureHoverInteraction,
  measurePointerInteraction,
  summariseInteractionSamples,
  type HoverInteractionSample,
  type InteractionPerformanceReport,
  type InteractionSample,
} from './fixtures/interactionPerformance';

const SAMPLE_COUNT = 5;
const SAFETY_CEILING_MS = 15_000;
const PREFETCH_TIMEOUT_MS = 2_000;
const REPORT_DIRECTORY_ENV = 'LACUNA_INTERACTION_REPORT_DIR';
const SETTINGS_ACKNOWLEDGEMENT = {
  selector: 'nav[aria-label="Primary navigation"] a[aria-current="page"]',
  text: 'Settings',
};
const SETTINGS_MEANINGFUL = { selector: 'main h1', text: 'Settings' };
const STUDY_ACKNOWLEDGEMENT = { selector: '[role="dialog"]' };
const STUDY_MEANINGFUL = { selector: '[role="dialog"] button', text: 'Welcome to Lacuna' };
const STUDY_SETTLED = { selector: '[role="dialog"] > div.absolute.inset-x-0.bottom-0' };
const SETTINGS_CHUNK = /\/assets\/[^/]*Settings[^/]*\.js/;

interface PrefetchSample {
  observed: boolean;
  pointerOverToRequestStartMs: number | null;
}

interface BenchmarkReport extends Omit<
  InteractionPerformanceReport,
  'schemaVersion' | 'cold' | 'warm'
> {
  schemaVersion: 2;
  execution: 'sequential isolated contexts; browser process shared';
  hover: {
    semantics: 'pointerenter to first computed hover-style change and following frame boundary';
    samples: HoverInteractionSample[];
  };
  prefetch?: {
    semantics: 'pointerover to matching request start';
    samples: PrefetchSample[];
  };
  cold: { samples: InteractionSample[]; summary: ReturnType<typeof summariseInteractionSamples> };
  warm: { samples: InteractionSample[]; summary: ReturnType<typeof summariseInteractionSamples> };
}

test.use({ trace: 'off', video: 'off' });
test.setTimeout(120_000);

test('records cold and warm sidebar Settings interaction timings', async ({
  browser,
}, testInfo) => {
  const cold: InteractionSample[] = [];
  const warm: InteractionSample[] = [];
  const hover: HoverInteractionSample[] = [];
  const prefetch: PrefetchSample[] = [];
  const baseURL = String(testInfo.project.use.baseURL);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await openSeededDashboard(page);
      const settings = getSettingsLink(page);
      const hoverResult = await measurePrefetchedHover(page, settings, SETTINGS_CHUNK);
      hover.push(hoverResult.hover);
      prefetch.push(hoverResult.prefetch);
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
    hover: {
      semantics: 'pointerenter to first computed hover-style change and following frame boundary',
      samples: hover,
    },
    prefetch: { semantics: 'pointerover to matching request start', samples: prefetch },
    cold: { samples: cold, summary: summariseInteractionSamples(cold) },
    warm: { samples: warm, summary: summariseInteractionSamples(warm) },
  };
  await attachReport(testInfo, report, 'settings-navigation.json');
  assertReport(report);
});

test('records first and repeat sidebar Study Sheet interaction timings', async ({
  browser,
}, testInfo) => {
  const cold: InteractionSample[] = [];
  const warm: InteractionSample[] = [];
  const hover: HoverInteractionSample[] = [];
  const baseURL = String(testInfo.project.use.baseURL);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await openSeededDashboard(page);
      const study = getStudyTrigger(page);
      hover.push((await measureHoverInteraction({ page, trigger: study })).sample);
      await movePointerAway(page);
      cold.push(await measureStudySheet(page, study));
      await closeStudySheet(page);
      await movePointerAway(page);
      warm.push(await measureStudySheet(page, study));
    } finally {
      await context.close();
    }
  }

  const report: BenchmarkReport = {
    schemaVersion: 2,
    execution: 'sequential isolated contexts; browser process shared',
    interaction: 'sidebar Review today / Study now Study Sheet',
    motion: 'enabled',
    hover: {
      semantics: 'pointerenter to first computed hover-style change and following frame boundary',
      samples: hover,
    },
    cold: { samples: cold, summary: summariseInteractionSamples(cold) },
    warm: { samples: warm, summary: summariseInteractionSamples(warm) },
  };
  await attachReport(testInfo, report, 'study-sheet.json');
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

async function measureSettingsNavigation(page: Page): Promise<InteractionSample> {
  const result = await measurePointerInteraction({
    page,
    trigger: getSettingsLink(page),
    acknowledgement: SETTINGS_ACKNOWLEDGEMENT,
    meaningful: SETTINGS_MEANINGFUL,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return result;
}

function getStudyTrigger(page: Page): Locator {
  return page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /^(Review today|Study now)$/ });
}

async function measureStudySheet(page: Page, study: Locator): Promise<InteractionSample> {
  return measurePointerInteraction({
    page,
    trigger: study,
    acknowledgement: STUDY_ACKNOWLEDGEMENT,
    meaningful: STUDY_MEANINGFUL,
    settled: STUDY_SETTLED,
  });
}

async function measurePrefetchedHover(
  page: Page,
  trigger: Locator,
  prefetchPattern: RegExp,
): Promise<{ hover: HoverInteractionSample; prefetch: PrefetchSample }> {
  const prefetchRequest = page
    .waitForRequest(prefetchPattern, { timeout: PREFETCH_TIMEOUT_MS })
    .catch(() => undefined);
  const hover = await measureHoverInteraction({ page, trigger });
  const request = await prefetchRequest;
  const requestStartMs = request?.timing().startTime;
  return {
    hover: hover.sample,
    prefetch: {
      observed: request !== undefined,
      pointerOverToRequestStartMs:
        requestStartMs === undefined ? null : round(requestStartMs - hover.pointerOverEpochMs),
    },
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
  expect(report.hover.samples).toHaveLength(SAMPLE_COUNT);
  for (const sample of report.hover.samples) {
    expect(sample.pointerEnterToStyleChangeMs).toBeGreaterThan(0);
    expect(sample.pointerEnterToPostPaintMs).toBeGreaterThan(sample.pointerEnterToStyleChangeMs);
    expect(sample.pointerEnterToPostPaintMs).toBeLessThan(SAFETY_CEILING_MS);
    expect(sample.changedProperties.length).toBeGreaterThan(0);
  }
  if (report.prefetch !== undefined) {
    expect(report.prefetch.samples).toHaveLength(SAMPLE_COUNT);
    expect(report.prefetch.samples.every((sample) => sample.observed)).toBe(true);
    for (const sample of report.prefetch.samples) {
      expect(sample.pointerOverToRequestStartMs).not.toBeNull();
      expect(sample.pointerOverToRequestStartMs ?? -1).toBeGreaterThanOrEqual(0);
      expect(sample.pointerOverToRequestStartMs ?? Number.POSITIVE_INFINITY).toBeLessThan(
        SAFETY_CEILING_MS,
      );
    }
  }
  for (const sample of [...report.cold.samples, ...report.warm.samples]) {
    if (sample.settlementMs !== undefined) {
      expect(sample.settlementMs).toBeGreaterThanOrEqual(sample.meaningfulMs);
    }
  }
}

async function attachReport(
  testInfo: TestInfo,
  report: BenchmarkReport,
  outputFileName: string,
): Promise<void> {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  await testInfo.attach('interaction-performance.json', {
    body: Buffer.from(body, 'utf8'),
    contentType: 'application/json',
  });

  const reportDirectory = process.env[REPORT_DIRECTORY_ENV];
  if (reportDirectory === undefined) return;
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(join(reportDirectory, outputFileName), body, 'utf8');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
