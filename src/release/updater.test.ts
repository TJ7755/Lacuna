import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoUpdater: {
    allowPrerelease: false,
    logger: undefined as unknown,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
  },
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({ default: mocks }));
vi.mock('electron-log', () => ({ default: mocks.log }));

import { initAutoUpdater } from '../../electron/updater.js';

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

    initAutoUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks for beta updates on NSIS Windows installations', () => {
    initAutoUpdater();
    vi.advanceTimersByTime(5_000);

    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('skips Debian Linux installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    initAutoUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks for beta updates on AppImage Linux installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('APPIMAGE', '/tmp/Lacuna.AppImage');

    initAutoUpdater();
    vi.advanceTimersByTime(5_000);

    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('skips unsigned macOS installations', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    initAutoUpdater();

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled();
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.log.info).toHaveBeenCalledWith(
      'Auto-updater skipped: unsigned macOS installations update manually.',
    );
  });
});
