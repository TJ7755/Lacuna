import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import log from 'electron-log';

/** Configure and start the auto-updater. */
export function initAutoUpdater(): void {
  // electron-updater only supports macOS, Windows, and Linux AppImage.
  // Lacuna is currently distributed as NSIS / portable on Windows only,
  // so auto-updates on Linux would silently fail.
  if (process.platform === 'linux') {
    log.info('Auto-updater skipped: Linux is not a supported distribution target.');
    return;
  }

  autoUpdater.logger = log;

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
  });

  // Check for updates shortly after launch so startup is never blocked.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — no update server is not an error in dev.
    });
  }, 5_000);
}
