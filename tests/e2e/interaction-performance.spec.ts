import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  attachInteractionPerformanceReport,
  measurePointerInteraction,
  summariseInteractionSamples,
  type InteractionPerformanceReport,
  type InteractionSample,
} from './fixtures/interactionPerformance';

const SAMPLE_COUNT = 5;
const SAFETY_CEILING_MS = 15_000;
const CARDS_ACKNOWLEDGEMENT = {
  selector:
    'nav[aria-label="Course sections"] a[aria-label="Cards"][aria-current="page"] [data-course-tab-indicator]',
};
const CARDS_MEANINGFUL = { selector: 'main h1', text: 'Cards' };

test.use({ trace: 'off', video: 'off' });
test.setTimeout(120_000);

test('records cold and warm course Cards interaction timings', async ({ browser }, testInfo) => {
  const cold: InteractionSample[] = [];
  const warm: InteractionSample[] = [];
  const baseURL = String(testInfo.project.use.baseURL);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const context = await browser.newContext({ baseURL, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage();
      await openSeededCourse(page);
      cold.push(await measureCardsNavigation(page));

      await returnToCoursePath(page);
      warm.push(await measureCardsNavigation(page));
    } finally {
      await context.close();
    }
  }

  const report: InteractionPerformanceReport = {
    schemaVersion: 1,
    interaction: 'seeded course Path to Cards',
    motion: 'enabled',
    cold: { samples: cold, summary: summariseInteractionSamples(cold) },
    warm: { samples: warm, summary: summariseInteractionSamples(warm) },
  };
  await attachInteractionPerformanceReport(testInfo, report);

  expect(report.cold.summary.sampleCount).toBe(SAMPLE_COUNT);
  expect(report.warm.summary.sampleCount).toBe(SAMPLE_COUNT);
  expect(report.cold.summary.acknowledgementMs.median).toBeGreaterThan(0);
  expect(report.warm.summary.acknowledgementMs.median).toBeGreaterThan(0);
  expect(report.cold.summary.meaningfulMs.p95).toBeLessThan(SAFETY_CEILING_MS);
  expect(report.warm.summary.meaningfulMs.p95).toBeLessThan(SAFETY_CEILING_MS);
});

async function openSeededCourse(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Study for the day that counts.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toBeVisible();
  await assertMotionEnabled(page);
}

async function measureCardsNavigation(page: Page): Promise<InteractionSample> {
  const navigation = page.locator('nav[aria-label="Course sections"]:visible');
  const cards = navigation.getByRole('link', { name: 'Cards', exact: true });
  const result = await measurePointerInteraction({
    page,
    trigger: cards,
    acknowledgement: CARDS_ACKNOWLEDGEMENT,
    meaningful: CARDS_MEANINGFUL,
  });
  await expect(page.getByRole('heading', { name: 'Cards', exact: true })).toBeVisible();
  // Let the outgoing route leave before the unmeasured return journey. This is
  // deliberately after the result has been captured, so animation completion is
  // neither the acknowledgement nor the meaningful-readiness signal.
  await expect(page.locator('nav[aria-label="Course sections"]:visible')).toHaveCount(1);
  await expect(page.locator(CARDS_ACKNOWLEDGEMENT.selector).first()).toBeVisible();
  return result;
}

async function returnToCoursePath(page: Page): Promise<void> {
  await page
    .locator('nav[aria-label="Course sections"]:visible')
    .getByRole('link', { name: 'Path', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toBeVisible();
  await expect(page.locator('nav[aria-label="Course sections"]:visible')).toHaveCount(1);
}

async function assertMotionEnabled(page: Page): Promise<void> {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    false,
  );
}
