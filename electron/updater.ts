import electronUpdater from 'electron-updater';
import log from 'electron-log';
import { createDesktopUpdater, type DesktopUpdater, type UpdateState } from './updaterService.js';

const { autoUpdater } = electronUpdater;

interface AutoUpdaterOptions {
  currentVersion: string;
  packaged: boolean;
  publishState: (state: UpdateState) => void;
}

/** Configure the packaged updater and return its renderer-safe control surface. */
export function initAutoUpdater(options: AutoUpdaterOptions): DesktopUpdater {
  autoUpdater.logger = log;

  return createDesktopUpdater({
    updater: autoUpdater,
    platform: process.platform,
    environment: process.env,
    currentVersion: options.currentVersion,
    packaged: options.packaged,
    publishState: options.publishState,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    logInfo: (message) => log.info(message),
    logError: (message, error) => log.error(message, error),
  });
}
