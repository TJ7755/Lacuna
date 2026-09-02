import type { Page } from '@playwright/test';
import type {
  BrowserProbeResult,
  InteractionScenario,
  PackagedInteractionSample,
  RunningPackagedApp,
} from './types';

const PROBE_KEY = '__lacunaPackagedInteractionProbe';

async function twoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function waitForSeededDashboard(page: Page): Promise<void> {
  const dashboard = page.getByRole('heading', { name: 'Courses', exact: true });
  const openLacuna = page.getByRole('button', { name: 'Open Lacuna', exact: true }).first();
  await openLacuna.or(dashboard).waitFor({ state: 'visible' });
  if (!(await dashboard.isVisible().catch(() => false))) {
    await openLacuna.click();
  }
  await dashboard.waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '');
  await page
    .getByRole('heading', { name: 'Welcome to Lacuna', exact: true })
    .first()
    .waitFor({ state: 'visible' });
  await twoAnimationFrames(page);
}

async function resetToSeededDashboard(page: Page): Promise<void> {
  const quickSearch = page.getByRole('dialog', { name: 'Quick search', exact: true });
  if (await quickSearch.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await quickSearch.waitFor({ state: 'hidden' });
  }
  if (await page.evaluate(() => window.location.hash !== '#/' && window.location.hash !== '')) {
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
  }
  await page.getByRole('heading', { name: 'Courses', exact: true }).waitFor({ state: 'visible' });
  const expandSidebar = page.getByRole('button', { name: 'Expand sidebar', exact: true });
  if (await expandSidebar.isVisible().catch(() => false)) {
    await expandSidebar.click();
    await page
      .getByRole('button', { name: 'Collapse sidebar', exact: true })
      .waitFor({ state: 'visible' });
  }
  await page
    .getByRole('heading', { name: 'Welcome to Lacuna', exact: true })
    .first()
    .waitFor({ state: 'visible' });
  await twoAnimationFrames(page);
}

async function installBrowserProbe(page: Page, scenario: InteractionScenario): Promise<void> {
  await page.evaluate(
    ({ key, measuredScenario }) => {
      interface ProbeState {
        scenario: InteractionScenario;
        inputAt: number | null;
        feedbackAt: number | null;
        usableAt: number | null;
        settledAt: number | null;
        longTasks: { startTime: number; duration: number }[];
        observer?: MutationObserver;
        longTaskObserver?: PerformanceObserver;
        hashChangeListener: () => void;
        inputListener: () => void;
      }
      const targetWindow = window as unknown as Record<string, ProbeState | undefined>;
      const state: ProbeState = {
        scenario: measuredScenario,
        inputAt: null,
        feedbackAt: null,
        usableAt: null,
        settledAt: null,
        longTasks: [],
        hashChangeListener: () => undefined,
        inputListener: () => undefined,
      };

      const headingExists = (level: 1 | 2, text: string) =>
        Array.from(document.querySelectorAll(`h${level}`)).some(
          (heading) => heading.textContent?.trim() === text,
        );
      const hasFeedback = () => {
        if (measuredScenario === 'search') {
          return document.querySelector('[role="dialog"][aria-label="Quick search"]') !== null;
        }
        if (measuredScenario === 'settings') return window.location.hash.startsWith('#/settings');
        return /^#\/course\/[^/]+\/?$/.test(window.location.hash);
      };
      const isUsable = () => {
        if (measuredScenario === 'search') {
          const dialog = document.querySelector('[role="dialog"][aria-label="Quick search"]');
          const input = dialog?.querySelector('input[role="combobox"]');
          return dialog !== null && input === document.activeElement;
        }
        if (measuredScenario === 'settings') return headingExists(1, 'Settings');
        return headingExists(2, 'Curriculum');
      };
      const check = () => {
        if (state.inputAt === null) return;
        if (state.feedbackAt === null && hasFeedback()) state.feedbackAt = performance.now();
        if (state.usableAt !== null || !isUsable()) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (state.usableAt === null) state.usableAt = performance.now();
          });
        });
      };
      state.inputListener = () => {
        if (state.inputAt !== null) return;
        state.inputAt = performance.now();
        check();
      };

      state.observer = new MutationObserver(check);
      state.observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      state.hashChangeListener = check;
      window.addEventListener('hashchange', state.hashChangeListener);
      window.addEventListener('pointerdown', state.inputListener, { capture: true, once: true });
      window.addEventListener('keydown', state.inputListener, { capture: true, once: true });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        state.longTaskObserver = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        });
        state.longTaskObserver.observe({ type: 'longtask', buffered: true });
      }
      targetWindow[key] = state;
    },
    { key: PROBE_KEY, measuredScenario: scenario },
  );
}

async function performInteraction(page: Page, scenario: InteractionScenario): Promise<void> {
  if (scenario === 'search') {
    await page.getByRole('button', { name: /Quick search/ }).click();
    return;
  }
  if (scenario === 'settings') {
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
    return;
  }
  await page
    .locator('main')
    .getByRole('button', { name: /Welcome to Lacuna/ })
    .first()
    .click();
}

async function finishBrowserProbe(
  page: Page,
  scenario: InteractionScenario,
): Promise<BrowserProbeResult> {
  await page.waitForFunction((key) => {
    const targetWindow = window as unknown as Record<
      string,
      { inputAt: number | null; feedbackAt: number | null; usableAt: number | null } | undefined
    >;
    const state = targetWindow[key];
    return state?.inputAt !== null && state?.feedbackAt !== null && state?.usableAt !== null;
  }, PROBE_KEY);

  return page.evaluate(
    async ({ key, measuredScenario }) => {
      interface ProbeState {
        inputAt: number | null;
        feedbackAt: number | null;
        usableAt: number | null;
        settledAt: number | null;
        longTasks: { startTime: number; duration: number }[];
        observer?: MutationObserver;
        longTaskObserver?: PerformanceObserver;
        hashChangeListener: () => void;
        inputListener: () => void;
      }
      const targetWindow = window as unknown as Record<string, ProbeState | undefined>;
      const state = targetWindow[key];
      if (
        !state ||
        state.inputAt === null ||
        state.feedbackAt === null ||
        state.usableAt === null
      ) {
        throw new Error('The packaged interaction probe did not observe every boundary.');
      }
      const scope =
        measuredScenario === 'search'
          ? document.querySelector('[role="dialog"][aria-label="Quick search"]')
          : document.querySelector('main');
      const animations = (scope?.getAnimations({ subtree: true }) ?? []).filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return (
          timing !== undefined &&
          typeof timing.endTime === 'number' &&
          Number.isFinite(timing.endTime) &&
          timing.endTime > 0
        );
      });
      const finiteAnimationDurationsMs = animations
        .map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0))
        .filter((duration) => duration > 0 && Number.isFinite(duration))
        .sort((left, right) => left - right);
      await Promise.allSettled(animations.map((animation) => animation.finished));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      state.settledAt = performance.now();
      state.observer?.disconnect();
      state.longTaskObserver?.disconnect();
      window.removeEventListener('hashchange', state.hashChangeListener);
      window.removeEventListener('pointerdown', state.inputListener, true);
      window.removeEventListener('keydown', state.inputListener, true);

      return {
        inputAt: state.inputAt,
        feedbackAt: state.feedbackAt,
        usableAt: state.usableAt,
        settledAt: state.settledAt,
        finiteAnimationDurationsMs,
        longTasks: state.longTasks,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        motionSpeed: localStorage.getItem('lacuna.motionSpeed') ?? 'normal',
      };
    },
    { key: PROBE_KEY, measuredScenario: scenario },
  );
}

export async function runPackagedInteractionSample(options: {
  running: RunningPackagedApp;
  executablePath: string;
  scenario: InteractionScenario;
  idleDelayMs: number;
}): Promise<PackagedInteractionSample> {
  const { running } = options;
  const firstErrorIndex = running.errors.length;
  await resetToSeededDashboard(running.page);
  if (options.idleDelayMs > 0) await running.page.waitForTimeout(options.idleDelayMs);
  await installBrowserProbe(running.page, options.scenario);
  await performInteraction(running.page, options.scenario);
  const probe = await finishBrowserProbe(running.page, options.scenario);
  const relevantLongTasks = probe.longTasks.filter(
    (entry) => entry.startTime >= probe.inputAt && entry.startTime <= probe.settledAt,
  );
  const longTaskDurations = relevantLongTasks.map((entry) => entry.duration);

  return {
    scenario: options.scenario,
    idleDelayMs: options.idleDelayMs,
    executablePath: options.executablePath,
    appVersion: running.appVersion,
    packaged: running.packaged,
    rendererProtocol: running.rendererProtocol,
    rendererUrl: running.rendererUrl,
    viteResourceCount: running.viteResourceCount,
    reducedMotion: probe.reducedMotion,
    motionSpeed: probe.motionSpeed,
    inputToFeedbackMs: probe.feedbackAt - probe.inputAt,
    inputToUsableMs: probe.usableAt - probe.inputAt,
    inputToSettledMs: probe.settledAt - probe.inputAt,
    finiteAnimationDurationsMs: probe.finiteAnimationDurationsMs,
    longTaskCount: relevantLongTasks.length,
    longTaskTotalMs: longTaskDurations.reduce((total, duration) => total + duration, 0),
    longestLongTaskMs: Math.max(0, ...longTaskDurations),
    errors: running.errors.slice(firstErrorIndex),
  };
}
