import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

export type InteractionScenario = 'search' | 'settings' | 'course';

export interface PackagedInteractionSample {
  scenario: InteractionScenario;
  idleDelayMs: number;
  executablePath: string;
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
  reducedMotion: boolean;
  motionSpeed: string;
  inputToFeedbackMs: number;
  inputToUsableMs: number;
  inputToSettledMs: number;
  finiteAnimationDurationsMs: number[];
  longTaskCount: number;
  longTaskTotalMs: number;
  longestLongTaskMs: number;
  errors: string[];
}

export interface PackagedLaunchProof {
  executablePath: string;
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
}

export interface PackagedProcessExit {
  pid: number;
  exitCode: number;
  signalCode: null;
}

export interface PackagedInteractionSuiteResult {
  launch: PackagedLaunchProof;
  processExit: PackagedProcessExit;
  samples: PackagedInteractionSample[];
}

export interface PackagedInteractionMeasurement {
  scenario: InteractionScenario;
  idleDelayMs: number;
}

interface RunningPackagedApp {
  browser: Browser;
  child: ChildProcess;
  page: Page;
  errors: string[];
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
}

interface BrowserProbeResult {
  inputAt: number;
  feedbackAt: number;
  usableAt: number;
  settledAt: number;
  finiteAnimationDurationsMs: number[];
  longTasks: { startTime: number; duration: number }[];
  reducedMotion: boolean;
  motionSpeed: string;
}

const PROBE_KEY = '__lacunaPackagedInteractionProbe';
const DEVTOOLS_HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_PACKAGED_LAUNCHES = 1;

let activeChild: ChildProcess | undefined;
let launchCount = 0;
let electronWorkFailed = false;

interface DevToolsVersion {
  webSocketDebuggerUrl?: unknown;
}

interface DevToolsTarget {
  type?: unknown;
  url?: unknown;
  title?: unknown;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function allocateLoopbackPort(): Promise<number> {
  const server = createServer();
  server.unref();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, DEVTOOLS_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate a loopback port for packaged Electron DevTools.');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function collectOutput(child: ChildProcess): { lines: string[]; stop: () => void } {
  const lines: string[] = [];
  const record = (chunk: Buffer | string) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) lines.push(line);
    }
    if (lines.length > 40) lines.splice(0, lines.length - 40);
  };
  child.stdout?.on('data', record);
  child.stderr?.on('data', record);
  return {
    lines,
    stop: () => {
      child.stdout?.off('data', record);
      child.stderr?.off('data', record);
    },
  };
}

function processFailure(child: ChildProcess, output: readonly string[]): string {
  const state =
    child.exitCode !== null
      ? `exit code ${child.exitCode}`
      : child.signalCode !== null
        ? `signal ${child.signalCode}`
        : 'an unknown state';
  return (
    `The packaged Electron process ended with ${state}.` +
    (output.length > 0 ? `\n${output.join('\n')}` : '')
  );
}

async function waitForDevTools(
  child: ChildProcess,
  port: number,
  output: readonly string[],
  getSpawnError: () => Error | undefined,
): Promise<string> {
  const origin = `http://${DEVTOOLS_HOST}:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let rendererReadyAt: number | undefined;
  while (Date.now() < deadline) {
    const spawnError = getSpawnError();
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(processFailure(child, output));
    }
    try {
      const [versionResponse, targetsResponse] = await Promise.all([
        fetch(`${origin}/json/version`),
        fetch(`${origin}/json/list`),
      ]);
      if (versionResponse.ok && targetsResponse.ok) {
        const version = (await versionResponse.json()) as DevToolsVersion;
        const targets = (await targetsResponse.json()) as DevToolsTarget[];
        const rendererReady = targets.some(
          (target) =>
            target.type === 'page' &&
            typeof target.url === 'string' &&
            target.url.startsWith('app:') &&
            target.title === 'Lacuna',
        );
        if (rendererReady) {
          rendererReadyAt ??= Date.now();
          if (
            Date.now() - rendererReadyAt >= 500 &&
            typeof version.webSocketDebuggerUrl === 'string'
          ) {
            return version.webSocketDebuggerUrl;
          }
        } else {
          rendererReadyAt = undefined;
        }
      }
    } catch {
      // DevTools is not accepting connections yet.
    }
    await delay(25);
  }
  throw new Error(
    `Packaged Electron DevTools did not become ready within ${STARTUP_TIMEOUT_MS} ms.` +
      (output.length > 0 ? `\n${output.join('\n')}` : ''),
  );
}

function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function stopFailedChild(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return;
  child.kill('SIGTERM');
  if (await waitForProcessExit(child, 5_000)) return;
  child.kill('SIGKILL');
  if (!(await waitForProcessExit(child, 5_000))) {
    throw new Error(
      `Packaged Electron process ${child.pid ?? 'unknown'} did not exit after emergency cleanup.`,
    );
  }
}

function assertLaunchAllowed(): void {
  if (electronWorkFailed) {
    throw new Error('Packaged Electron work stopped after an earlier launch or shutdown failure.');
  }
  if (activeChild) {
    if (!hasExited(activeChild)) {
      throw new Error(
        `Refusing to launch while packaged Electron process ${activeChild.pid ?? 'unknown'} is active.`,
      );
    }
    activeChild = undefined;
  }
  if (launchCount >= MAX_PACKAGED_LAUNCHES) {
    throw new Error(
      `Refusing packaged Electron launch ${launchCount + 1}; the hard cap is ${MAX_PACKAGED_LAUNCHES}.`,
    );
  }
}

async function closePackagedApp(application: RunningPackagedApp): Promise<PackagedProcessExit> {
  const { browser, child, page } = application;
  await page
    .evaluate(() => {
      const desktopWindow = window as unknown as {
        electronAPI?: { closeWindow?: () => void };
      };
      desktopWindow.electronAPI?.closeWindow?.();
    })
    .catch(() => undefined);
  if (await waitForProcessExit(child, SHUTDOWN_TIMEOUT_MS)) {
    await browser.close().catch(() => undefined);
    activeChild = undefined;
    if (child.exitCode !== 0 || child.signalCode !== null || child.pid === undefined) {
      electronWorkFailed = true;
      throw new Error(processFailure(child, []));
    }
    return {
      pid: child.pid,
      exitCode: child.exitCode,
      signalCode: null,
    };
  }

  electronWorkFailed = true;
  await browser.close().catch(() => undefined);
  await stopFailedChild(child);
  activeChild = undefined;
  throw new Error(
    `Packaged Electron process ${child.pid ?? 'unknown'} did not shut down within ${SHUTDOWN_TIMEOUT_MS} ms; Electron work has stopped.`,
  );
}

async function twoAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function launchPackagedApp(
  executablePath: string,
  profileDirectory: string,
): Promise<RunningPackagedApp> {
  assertLaunchAllowed();
  const resolvedExecutablePath = await realpath(executablePath);
  if (resolvedExecutablePath !== executablePath) {
    throw new Error(
      `The packaged executable must be a real resolved path. Received ${executablePath}; resolved ${resolvedExecutablePath}.`,
    );
  }
  const port = await allocateLoopbackPort();
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-address=${DEVTOOLS_HOST}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDirectory}`,
      '--lang=en-GB',
    ],
    {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  activeChild = child;
  launchCount += 1;
  let spawnError: Error | undefined;
  child.once('error', (error) => {
    spawnError = error;
  });
  const output = collectOutput(child);
  let browser: Browser | undefined;
  const errors: string[] = [];

  try {
    const websocketEndpoint = await waitForDevTools(child, port, output.lines, () => spawnError);
    browser = await chromium.connectOverCDP(websocketEndpoint, { timeout: STARTUP_TIMEOUT_MS });
    const context = browser.contexts()[0];
    if (!context) throw new Error('The packaged Electron process exposed no browser context.');
    const page =
      context.pages()[0] ??
      (await context.waitForEvent('page', {
        timeout: STARTUP_TIMEOUT_MS,
      }));
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => localStorage.setItem('lacuna.motionSpeed', 'normal'));

    const desktop = await page.evaluate(async () => {
      const desktopWindow = window as unknown as {
        electronAPI?: {
          isElectron?: unknown;
          updater?: { getState?: () => Promise<{ currentVersion?: unknown }> };
        };
      };
      const currentVersion = await desktopWindow.electronAPI?.updater?.getState?.();
      return {
        isElectron: desktopWindow.electronAPI?.isElectron === true,
        appVersion: currentVersion?.currentVersion,
      };
    });
    const rendererUrl = page.url();
    const rendererProtocol = new URL(rendererUrl).protocol;
    const viteResourceCount = await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .filter((entry) => /(?:localhost:5173|@vite\/client)/.test(entry.name)).length,
    );

    const packaged = desktop.isElectron && rendererProtocol === 'app:';
    if (!desktop.isElectron)
      throw new Error('The packaged renderer did not expose the Electron preload API.');
    if (typeof desktop.appVersion !== 'string' || desktop.appVersion.length === 0) {
      throw new Error('The packaged renderer did not report its application version.');
    }
    if (rendererProtocol !== 'app:') {
      throw new Error(
        `The packaged renderer used ${rendererProtocol || 'an invalid URL'} instead of app:.`,
      );
    }
    if (viteResourceCount !== 0) throw new Error('The packaged renderer loaded a Vite resource.');

    return {
      browser,
      child,
      page,
      errors,
      appVersion: desktop.appVersion,
      packaged,
      rendererProtocol,
      rendererUrl,
      viteResourceCount,
    };
  } catch (error) {
    electronWorkFailed = true;
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await stopFailedChild(child);
    activeChild = undefined;
    throw error;
  } finally {
    output.stop();
  }
}

async function waitForSeededDashboard(page: Page): Promise<void> {
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

async function runPackagedInteractionSample(options: {
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

export async function runPackagedInteractionSuite(options: {
  executablePath: string;
  measurements: readonly PackagedInteractionMeasurement[];
}): Promise<PackagedInteractionSuiteResult> {
  if (options.measurements.length === 0) {
    throw new Error('The packaged interaction suite requires at least one measurement.');
  }
  const rootDirectory = await realpath(
    await mkdtemp(path.join(tmpdir(), 'lacuna-packaged-performance-')),
  );
  const profileDirectory = path.join(rootDirectory, 'profile');
  let running: RunningPackagedApp | undefined;
  let result: PackagedInteractionSuiteResult | undefined;
  let suiteError: unknown;
  try {
    running = await launchPackagedApp(options.executablePath, profileDirectory);
    await waitForSeededDashboard(running.page);
    if (running.errors.length > 0) {
      throw new Error(`The packaged launch reported errors:\n- ${running.errors.join('\n- ')}`);
    }
    const launch: PackagedLaunchProof = {
      executablePath: options.executablePath,
      appVersion: running.appVersion,
      packaged: running.packaged,
      rendererProtocol: running.rendererProtocol,
      rendererUrl: running.rendererUrl,
      viteResourceCount: running.viteResourceCount,
    };
    const samples: PackagedInteractionSample[] = [];
    for (const measurement of options.measurements) {
      const sample = await runPackagedInteractionSample({
        running,
        executablePath: options.executablePath,
        ...measurement,
      });
      assertPackagedInteractionSample(sample);
      samples.push(sample);
    }
    const processExit = await closePackagedApp(running);
    running = undefined;
    result = { launch, processExit, samples };
  } catch (error) {
    suiteError = error;
  }

  if (running) {
    try {
      await closePackagedApp(running);
    } catch (error) {
      suiteError = suiteError
        ? new AggregateError(
            [suiteError, error],
            'The packaged suite and its shutdown both failed.',
          )
        : error;
    }
  }
  await rm(rootDirectory, { recursive: true, force: true });
  if (suiteError) throw suiteError;
  if (!result) throw new Error('The packaged interaction suite ended without a result.');
  return result;
}

export function assertPackagedInteractionSample(sample: PackagedInteractionSample): void {
  if (!sample.packaged || sample.rendererProtocol !== 'app:' || sample.viteResourceCount !== 0) {
    throw new Error(`${sample.scenario} did not run against the packaged app renderer.`);
  }
  if (sample.reducedMotion || sample.motionSpeed !== 'normal') {
    throw new Error(`${sample.scenario} did not run with normal motion.`);
  }
  const timings = [sample.inputToFeedbackMs, sample.inputToUsableMs, sample.inputToSettledMs];
  if (timings.some((timing) => !Number.isFinite(timing) || timing < 0)) {
    throw new Error(`${sample.scenario} reported a non-finite or negative interaction timing.`);
  }
  if (
    sample.inputToUsableMs < sample.inputToFeedbackMs ||
    sample.inputToSettledMs < sample.inputToUsableMs
  ) {
    throw new Error(`${sample.scenario} reported interaction boundaries out of order.`);
  }
  if (
    sample.finiteAnimationDurationsMs.some(
      (duration) => !Number.isFinite(duration) || duration <= 0,
    )
  ) {
    throw new Error(`${sample.scenario} reported an invalid finite animation duration.`);
  }
  const longTaskValues = [sample.longTaskCount, sample.longTaskTotalMs, sample.longestLongTaskMs];
  if (longTaskValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`${sample.scenario} reported invalid Long Task data.`);
  }
  if (sample.errors.length > 0) {
    throw new Error(
      `${sample.scenario} reported renderer errors:\n- ${sample.errors.join('\n- ')}`,
    );
  }
}
