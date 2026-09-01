import type {
  ManualUpdateReason,
  UpdateProgress,
  UpdateState,
} from './updaterContract.js';

export type { UpdateState } from './updaterContract.js';

interface UpdateInfoPort {
  version: string;
}

export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(event: 'update-not-available', listener: (info: UpdateInfoPort) => void): unknown;
  on(event: 'update-available', listener: (info: UpdateInfoPort) => void): unknown;
  on(event: 'download-progress', listener: (progress: UpdateProgress) => void): unknown;
  on(event: 'update-downloaded', listener: (info: UpdateInfoPort) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface DesktopUpdater {
  getState(): UpdateState;
  checkForUpdates(): Promise<void>;
  restartAndInstall(): void;
}

interface DesktopUpdaterOptions {
  updater: UpdaterPort;
  platform: string;
  environment: Record<string, string | undefined>;
  currentVersion: string;
  packaged: boolean;
  publishState: (state: UpdateState) => void;
  schedule: (callback: () => void, delayMs: number) => unknown;
  logInfo: (message: string) => void;
  logError: (message: string, error?: unknown) => void;
}

const UPDATE_ERROR = 'Could not check for updates. Check your connection and try again.';

function manualReason(options: DesktopUpdaterOptions): ManualUpdateReason | undefined {
  if (!options.packaged) return 'development';
  if (options.platform === 'darwin') return 'unsigned-macos';
  if (options.platform === 'win32' && options.environment.PORTABLE_EXECUTABLE_FILE) {
    return 'windows-portable';
  }
  if (options.platform === 'linux' && !options.environment.APPIMAGE) return 'linux-deb';
  return undefined;
}

function copyState(state: UpdateState): UpdateState {
  return { ...state, progress: state.progress ? { ...state.progress } : undefined };
}

export function createDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdater {
  const unsupportedReason = manualReason(options);
  let state: UpdateState = unsupportedReason
    ? {
        phase: 'manual',
        mode: 'manual',
        currentVersion: options.currentVersion,
        manualReason: unsupportedReason,
      }
    : { phase: 'idle', mode: 'automatic', currentVersion: options.currentVersion };

  const publish = (next: UpdateState): void => {
    state = next;
    options.publishState(copyState(state));
  };

  const controller: DesktopUpdater = {
    getState: () => copyState(state),
    checkForUpdates: async () => {
      if (
        state.mode === 'manual' ||
        state.phase === 'checking' ||
        state.phase === 'available' ||
        state.phase === 'downloading'
      )
        return;
      publish({ ...state, phase: 'checking', error: undefined });
      try {
        await options.updater.checkForUpdates();
      } catch (error) {
        options.logError('Auto-updater check failed:', error);
        publish({
          phase: 'error',
          mode: 'automatic',
          currentVersion: options.currentVersion,
          error: UPDATE_ERROR,
        });
      }
    },
    restartAndInstall: () => {
      if (state.phase !== 'downloaded') return;
      options.updater.quitAndInstall(false, true);
    },
  };

  if (unsupportedReason) {
    options.logInfo(`Auto-updater skipped: ${unsupportedReason}.`);
    return controller;
  }

  options.updater.autoDownload = true;
  options.updater.autoInstallOnAppQuit = false;
  options.updater.allowPrerelease = true;

  options.updater.on('checking-for-update', () => {
    publish({ phase: 'checking', mode: 'automatic', currentVersion: options.currentVersion });
  });
  options.updater.on('update-not-available', () => {
    publish({ phase: 'up-to-date', mode: 'automatic', currentVersion: options.currentVersion });
  });
  options.updater.on('update-available', (info) => {
    publish({
      phase: 'available',
      mode: 'automatic',
      currentVersion: options.currentVersion,
      availableVersion: info.version,
    });
  });
  options.updater.on('download-progress', (progress) => {
    publish({
      phase: 'downloading',
      mode: 'automatic',
      currentVersion: options.currentVersion,
      availableVersion: state.availableVersion,
      progress: {
        percent: Math.max(0, Math.min(100, progress.percent)),
        transferred: Math.max(0, progress.transferred),
        total: Math.max(0, progress.total),
        bytesPerSecond: Math.max(0, progress.bytesPerSecond),
      },
    });
  });
  options.updater.on('update-downloaded', (info) => {
    publish({
      phase: 'downloaded',
      mode: 'automatic',
      currentVersion: options.currentVersion,
      availableVersion: info.version,
    });
  });
  options.updater.on('error', (error) => {
    options.logError('Auto-updater error:', error);
    publish({
      phase: 'error',
      mode: 'automatic',
      currentVersion: options.currentVersion,
      error: UPDATE_ERROR,
    });
  });

  options.schedule(() => void controller.checkForUpdates(), 5_000);
  return controller;
}
