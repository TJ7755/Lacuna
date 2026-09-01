import { describe, expect, it, vi } from 'vitest';
import { createDesktopUpdater, type UpdaterPort } from '../../electron/updaterService';

function fakeUpdater(): UpdaterPort {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  };
}

function listener(updater: UpdaterPort, event: string): (...args: unknown[]) => void {
  const mock = updater.on as unknown as {
    mock: { calls: Array<[string, (...args: unknown[]) => void]> };
  };
  const match = mock.mock.calls.find(([name]) => name === event);
  if (!match) throw new Error(`No listener registered for ${event}`);
  return match[1];
}

function options(
  updater: UpdaterPort,
  overrides: Partial<Parameters<typeof createDesktopUpdater>[0]> = {},
) {
  return {
    updater,
    platform: 'win32',
    environment: {},
    currentVersion: '0.2.3',
    packaged: true,
    publishState: vi.fn(),
    schedule: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
  };
}

describe('createDesktopUpdater', () => {
  it('downloads supported updates but never installs them merely because the app quits', () => {
    const updater = fakeUpdater();

    createDesktopUpdater(options(updater));

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(true);
  });

  it.each([
    ['darwin', {}, 'unsigned-macos'],
    ['win32', { PORTABLE_EXECUTABLE_FILE: 'Lacuna.exe' }, 'windows-portable'],
    ['linux', {}, 'linux-deb'],
  ] as const)('reports the manual route for %s packages', (platform, environment, manualReason) => {
    const controller = createDesktopUpdater(options(fakeUpdater(), { platform, environment }));

    expect(controller.getState()).toEqual({
      phase: 'manual',
      mode: 'manual',
      currentVersion: '0.2.3',
      manualReason,
    });
  });

  it('publishes progress and installs only after the explicit command', () => {
    const updater = fakeUpdater();
    const controller = createDesktopUpdater(options(updater));

    listener(updater, 'update-available')({ version: '0.2.4' });
    listener(
      updater,
      'download-progress',
    )({
      percent: 42,
      transferred: 42,
      total: 100,
      bytesPerSecond: 10,
    });

    expect(controller.getState()).toMatchObject({
      phase: 'downloading',
      availableVersion: '0.2.4',
      progress: { percent: 42, transferred: 42, total: 100, bytesPerSecond: 10 },
    });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    listener(updater, 'update-downloaded')({ version: '0.2.4' });
    expect(controller.getState()).toMatchObject({ phase: 'downloaded', availableVersion: '0.2.4' });
    controller.restartAndInstall();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('turns a failed check into a safe, actionable renderer error', async () => {
    const updater = fakeUpdater();
    vi.mocked(updater.checkForUpdates).mockRejectedValue(new Error('/private/path and token'));
    const controller = createDesktopUpdater(options(updater));

    await controller.checkForUpdates();

    expect(controller.getState()).toEqual({
      phase: 'error',
      mode: 'automatic',
      currentVersion: '0.2.3',
      error: 'Could not check for updates. Check your connection and try again.',
    });
    expect(JSON.stringify(controller.getState())).not.toContain('/private/path');
  });
});
