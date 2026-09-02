import type { CDPSession, Page } from '@playwright/test';
import {
  MEMORY_SAMPLES_PER_CHECKPOINT,
  MEMORY_SAMPLE_INTERVAL_MS,
  summariseMemorySeries,
} from './memory-statistics';
import { samplePackagedMemory } from './memory-probe';
import type {
  MemoryCheckpoint,
  PackagedMemoryCheckpointResult,
  PackagedMemoryRawSample,
} from './memory-types';
import type { RunningPackagedApp } from './types';

const QUIET_MS = 2_000;
const FINAL_IDLE_MS = 15_000;

export const MEMORY_CHECKPOINT_ORDER: readonly MemoryCheckpoint[] = [
  'cold-idle',
  'course-open',
  'dashboard-returned',
  'study-open',
  'study-closed',
  'ai-enabled-idle',
  'ai-open',
  'ai-closed',
  'large-dashboard',
  'large-course',
  'large-study-open',
  'large-study-closed',
  'returned-idle',
];

async function twoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function settle(page: Page, quietMs = QUIET_MS): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.documentElement
      .getAnimations({ subtree: true })
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.allSettled(finite.map((animation) => animation.finished));
  });
  await twoAnimationFrames(page);
  await page.waitForTimeout(quietMs);
}

async function collectCheckpoint(
  checkpoint: MemoryCheckpoint,
  running: RunningPackagedApp,
  cdp: CDPSession,
): Promise<PackagedMemoryCheckpointResult> {
  const samples: PackagedMemoryRawSample[] = [];
  for (let index = 0; index < MEMORY_SAMPLES_PER_CHECKPOINT; index += 1) {
    samples.push(await samplePackagedMemory(running, cdp));
    if (index < MEMORY_SAMPLES_PER_CHECKPOINT - 1) {
      await running.page.waitForTimeout(MEMORY_SAMPLE_INTERVAL_MS);
    }
  }
  const privateValues = samples.map((sample) => sample.privateBytes);
  return {
    checkpoint,
    totals: {
      sumOfWorkingSetsBytes: summariseMemorySeries(
        samples.map((sample) => sample.sumOfWorkingSetsBytes),
      ),
      ...(privateValues.every((value): value is number => typeof value === 'number')
        ? { privateBytes: summariseMemorySeries(privateValues) }
        : {}),
      rendererHeapUsedBytes: summariseMemorySeries(
        samples.map((sample) => sample.renderer.heapUsedBytes),
      ),
    },
    samples,
  };
}

async function dashboard(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor({ state: 'visible' });
}

async function openCourse(page: Page, name: string): Promise<void> {
  await page
    .locator('main')
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  await page
    .getByRole('heading', { name: 'Curriculum', exact: true })
    .waitFor({ state: 'visible' });
}

async function openStudySheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose what to study', exact: true })
    .waitFor({ state: 'visible' });
}

async function closeStudy(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog', { name: 'Choose what to study', exact: true })
    .waitFor({ state: 'hidden' });
}

async function rendererFailureContext(page: Page, errors: readonly string[]): Promise<string> {
  const visibleText = await page
    .locator('body')
    .innerText()
    .then((text) => text.replace(/\s+/g, ' ').trim().slice(0, 1_000))
    .catch(() => '<body unavailable>');
  return [
    `URL: ${page.url()}`,
    `Visible text: ${visibleText || '<empty>'}`,
    `Renderer errors: ${errors.length > 0 ? errors.join(' | ') : '<none recorded>'}`,
  ].join('\n');
}

async function enableAi(running: RunningPackagedApp): Promise<void> {
  const { page } = running;
  await page.evaluate(() => {
    localStorage.setItem(
      'lacuna.aiSettings',
      JSON.stringify({ enabled: true, misconceptionFirstEnabled: true }),
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'AI', exact: true }).waitFor({ state: 'visible' });
  } catch (error) {
    throw new Error(
      `AI-enabled reload did not return to the Dashboard.\n${await rendererFailureContext(
        page,
        running.errors,
      )}`,
      { cause: error },
    );
  }
}

async function importLargeFixture(page: Page, fixtureJson: string): Promise<void> {
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Recover this installation', { exact: true }).setInputFiles({
    name: 'lacuna-memory-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixtureJson),
  });
  await page.getByText('10000', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Replace local data', exact: true }).click();
  await page
    .getByText('Delete current local data, disconnect AI and restore this backup?', { exact: true })
    .waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Replace local data', exact: true }).click();
  await page.getByText('Data replaced from backup.', { exact: true }).waitFor({ state: 'visible' });
  await dashboard(page);
  await page
    .getByRole('heading', { name: 'Memory benchmark course', exact: true })
    .waitFor({ state: 'visible' });
}

interface MemoryWorkflowOperations {
  record: (checkpoint: MemoryCheckpoint, quietMs?: number) => Promise<void>;
  openCourse: (name: string) => Promise<void>;
  dashboard: () => Promise<void>;
  openStudySheet: () => Promise<void>;
  closeStudy: () => Promise<void>;
  enableAi: () => Promise<void>;
  openAi: () => Promise<void>;
  closeAi: () => Promise<void>;
  importLargeFixture: () => Promise<void>;
}

export async function executeMemoryCheckpointPlan(
  operations: MemoryWorkflowOperations,
): Promise<void> {
  await operations.record('cold-idle');
  await operations.openCourse('Welcome to Lacuna');
  await operations.record('course-open');
  await operations.dashboard();
  await operations.record('dashboard-returned');
  await operations.openCourse('Welcome to Lacuna');
  await operations.openStudySheet();
  await operations.record('study-open');
  await operations.closeStudy();
  await operations.record('study-closed');
  await operations.dashboard();
  await operations.enableAi();
  await operations.record('ai-enabled-idle');
  await operations.openAi();
  await operations.record('ai-open');
  await operations.closeAi();
  await operations.record('ai-closed');
  await operations.importLargeFixture();
  await operations.record('large-dashboard');
  await operations.openCourse('Memory benchmark course');
  await operations.record('large-course');
  await operations.openStudySheet();
  await operations.record('large-study-open');
  await operations.closeStudy();
  await operations.record('large-study-closed');
  await operations.dashboard();
  await operations.record('returned-idle', FINAL_IDLE_MS);
}

export async function runMemoryWorkflow(options: {
  running: RunningPackagedApp;
  fixtureJson: string;
}): Promise<PackagedMemoryCheckpointResult[]> {
  const { running } = options;
  const page = running.page;
  const cdp = await page.context().newCDPSession(page);
  const results: PackagedMemoryCheckpointResult[] = [];
  const record = async (checkpoint: MemoryCheckpoint, quietMs = QUIET_MS) => {
    await settle(page, quietMs);
    results.push(await collectCheckpoint(checkpoint, running, cdp));
  };
  try {
    await executeMemoryCheckpointPlan({
      record,
      openCourse: (name) => openCourse(page, name),
      dashboard: () => dashboard(page),
      openStudySheet: () => openStudySheet(page),
      closeStudy: () => closeStudy(page),
      enableAi: () => enableAi(running),
      openAi: async () => {
        await page.getByRole('button', { name: 'AI', exact: true }).click();
        await page
          .getByRole('complementary', { name: 'AI conversation', exact: true })
          .waitFor({ state: 'visible' });
      },
      closeAi: async () => {
        await page.getByRole('button', { name: 'Close AI', exact: true }).click();
        await page
          .getByRole('complementary', { name: 'AI conversation', exact: true })
          .waitFor({ state: 'hidden' });
      },
      importLargeFixture: () => importLargeFixture(page, options.fixtureJson),
    });
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  if (results.map((entry) => entry.checkpoint).join() !== MEMORY_CHECKPOINT_ORDER.join()) {
    throw new Error('The packaged memory workflow did not complete every checkpoint in order.');
  }
  return results;
}
