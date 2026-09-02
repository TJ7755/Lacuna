import type { ChildProcess } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import type { PackagedProcessExit, RunningPackagedApp } from './types';

const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_PACKAGED_LAUNCHES = 1;

let activeChild: ChildProcess | undefined;
let launchCount = 0;
let electronWorkFailed = false;

function processFailure(child: ChildProcess): string {
  const state =
    child.exitCode !== null
      ? `exit code ${child.exitCode}`
      : child.signalCode !== null
        ? `signal ${child.signalCode}`
        : 'an unknown state';
  return `The packaged Electron process ended with ${state}.`;
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
  const { application: electronApplication, child, page } = application;
  await page
    .evaluate(() => {
      const desktopWindow = window as unknown as {
        electronAPI?: { closeWindow?: () => void };
      };
      desktopWindow.electronAPI?.closeWindow?.();
    })
    .catch(() => undefined);
  if (await waitForProcessExit(child, SHUTDOWN_TIMEOUT_MS)) {
    await electronApplication.close().catch(() => undefined);
    activeChild = undefined;
    if (child.exitCode !== 0 || child.signalCode !== null || child.pid === undefined) {
      electronWorkFailed = true;
      throw new Error(processFailure(child));
    }
    return {
      pid: child.pid,
      exitCode: child.exitCode,
      signalCode: null,
    };
  }

  electronWorkFailed = true;
  await electronApplication.close().catch(() => undefined);
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
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete environment.NODE_OPTIONS;
  let electronApplication: ElectronApplication | undefined;
  launchCount += 1;
  try {
    electronApplication = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${profileDirectory}`, '--lang=en-GB'],
      env: environment,
      timeout: STARTUP_TIMEOUT_MS,
    });
  } catch (error) {
    electronWorkFailed = true;
    throw error;
  }
  const child = electronApplication.process();
  activeChild = child;
  const errors: string[] = [];

  try {
    const page = await electronApplication.firstWindow({ timeout: STARTUP_TIMEOUT_MS });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await page.waitForLoadState('domcontentloaded');
    const motionSpeed = await page.evaluate(
      () => localStorage.getItem('lacuna.motionSpeed') ?? 'normal',
    );
    if (motionSpeed !== 'normal') {
      throw new Error(`The packaged renderer started with motion speed ${motionSpeed}.`);
    }

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
      application: electronApplication,
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
    await electronApplication.close().catch(() => undefined);
    await stopFailedChild(child);
    activeChild = undefined;
    throw error;
  }
}
