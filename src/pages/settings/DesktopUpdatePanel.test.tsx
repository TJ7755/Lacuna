import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopUpdatePanel } from './DesktopUpdatePanel';
import type { DesktopUpdateState } from '../../electron/updateTypes';

const checkForUpdates = vi.fn().mockResolvedValue(undefined);
const restartAndInstall = vi.fn().mockResolvedValue(undefined);
let updateState: DesktopUpdateState;

describe('DesktopUpdatePanel', () => {
  beforeEach(() => {
    checkForUpdates.mockClear();
    restartAndInstall.mockClear();
    updateState = {
      phase: 'idle',
      mode: 'automatic',
      currentVersion: '0.2.3',
    };
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        updater: {
          getState: vi.fn(() => Promise.resolve(updateState)),
          checkForUpdates,
          restartAndInstall,
          onStateChange: vi.fn(() => () => undefined),
        },
      },
    });
  });

  it('shows the installed version and lets the user check manually', async () => {
    render(<DesktopUpdatePanel />);

    expect(await screen.findByText('Version 0.2.3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it('shows the download percentage and transferred size', async () => {
    updateState = {
      phase: 'downloading',
      mode: 'automatic',
      currentVersion: '0.2.3',
      availableVersion: '0.2.4',
      progress: {
        percent: 25,
        transferred: 25 * 1024 * 1024,
        total: 100 * 1024 * 1024,
        bytesPerSecond: 2 * 1024 * 1024,
      },
    };

    render(<DesktopUpdatePanel />);

    expect(await screen.findByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(screen.getByText('25 MB of 100 MB')).toBeInTheDocument();
  });

  it('installs a downloaded update only after explicit user action', async () => {
    updateState = {
      phase: 'downloaded',
      mode: 'automatic',
      currentVersion: '0.2.3',
      availableVersion: '0.2.4',
    };

    render(<DesktopUpdatePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart and install' }));
    expect(restartAndInstall).toHaveBeenCalledOnce();
  });

  it.each([
    ['windows-portable', 'Portable Windows builds update manually.'],
    ['linux-deb', 'DEB packages update manually.'],
    ['unsigned-macos', 'This unsigned macOS beta updates manually.'],
  ] as const)('explains the %s manual update route', async (manualReason, message) => {
    updateState = {
      phase: 'manual',
      mode: 'manual',
      currentVersion: '0.2.3',
      manualReason,
    };

    render(<DesktopUpdatePanel />);

    expect(await screen.findByText(message, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download the latest release' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/releases',
    );
    expect(screen.queryByRole('button', { name: 'Check for updates' })).not.toBeInTheDocument();
  });

  it('offers another check after an update error', async () => {
    updateState = {
      phase: 'error',
      mode: 'automatic',
      currentVersion: '0.2.3',
      error: 'Could not check for updates. Check your connection and try again.',
    };

    render(<DesktopUpdatePanel />);

    expect(await screen.findByText(updateState.error!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });
});
