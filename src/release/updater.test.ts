import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoUpdater: {
    allowPrerelease: false,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: undefined as unknown,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  },
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({ default: mocks }));
vi.mock('electron-log', () => ({ default: mocks.log }));

import { initAutoUpdater } from '../../electron/updater.js';

function startUpdater() {
  return initAutoUpdater({
    currentVersion: '0.2.3',
    packaged: true,
    publishState: vi.fn(),
  });
}

describe('Electron updater distribution rules', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', '');
    vi.stubEnv('APPIMAGE', '');
    mocks.autoUpdater.allowPrerelease = false;
    mocks.autoUpdater.logger = undefined;
    vi.clearAllMocks();
    mocks.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('skips portable Windows installations', () => {
    vi.stubEnv('PORTABLE_EXECUTABLE_FILE', 'C:\\Lacuna.exe');

    const updater = startUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.getState()).toMatchObject({ mode: 'manual', manualReason: 'windows-portable' });
  });

  it('checks for beta updates on NSIS Windows installations', () => {
    startUpdater();
    vi.advanceTimersByTime(5_000);

    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.autoDownload).toBe(true);
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mocks.autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('skips Debian Linux installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    const updater = startUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.getState()).toMatchObject({ mode: 'manual', manualReason: 'linux-deb' });
  });

  it('checks for beta updates on AppImage Linux installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('APPIMAGE', '/tmp/Lacuna.AppImage');

    startUpdater();
    vi.advanceTimersByTime(5_000);

    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('skips unsigned macOS installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    const updater = startUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.getState()).toMatchObject({ mode: 'manual', manualReason: 'unsigned-macos' });
  });
});
