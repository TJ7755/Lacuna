import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import log from 'electron-log';

/** Configure and start the auto-updater. */
export function initAutoUpdater(): void {
  // The unsigned beta cannot use macOS auto-update. Portable Windows and
  // Debian Linux installations are also manual-update targets.
  if (process.platform === 'darwin') {
    log.info('Auto-updater skipped: unsigned macOS installations update manually.');
    return;
  }
  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) {
    log.info('Auto-updater skipped: portable Windows installations update manually.');
    return;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    log.info('Auto-updater skipped: only AppImage installations support updates.');
    return;
  }

  autoUpdater.logger = log;
  // v0.2.0 is a beta; disable this for the first stable release channel.
  autoUpdater.allowPrerelease = true;

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
