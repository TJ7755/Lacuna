import { spawn, type ChildProcess } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import { chromium, type Browser } from '@playwright/test';
import type { PackagedProcessExit, RunningPackagedApp } from './types';

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

export async function closePackagedApp(
  application: RunningPackagedApp,
): Promise<PackagedProcessExit> {
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

export async function launchPackagedApp(
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
