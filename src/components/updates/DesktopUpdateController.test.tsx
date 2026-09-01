import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopUpdateController } from './DesktopUpdateController';
import type { DesktopUpdateState } from '../../electron/updateTypes';

let updateState: DesktopUpdateState;
const restartAndInstall = vi.fn().mockResolvedValue(undefined);
const checkForUpdates = vi.fn().mockResolvedValue(undefined);

describe('DesktopUpdateController', () => {
  beforeEach(() => {
    restartAndInstall.mockClear();
    checkForUpdates.mockClear();
    updateState = {
      phase: 'downloaded',
      mode: 'automatic',
      currentVersion: '0.2.3',
      availableVersion: '0.2.4',
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

  it('asks before restarting and respects Later', async () => {
    render(<DesktopUpdateController />);

    const dialog = await screen.findByRole('dialog', { name: 'Update ready' });
    expect(dialog).toHaveTextContent('Version 0.2.4 has finished downloading.');

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog', { name: 'Update ready' })).not.toBeInTheDocument();
    expect(restartAndInstall).not.toHaveBeenCalled();
  });

  it('shows unobtrusive download progress outside Settings', async () => {
    updateState = {
      phase: 'downloading',
      mode: 'automatic',
      currentVersion: '0.2.3',
      availableVersion: '0.2.4',
      progress: {
        percent: 42,
        transferred: 42,
        total: 100,
        bytesPerSecond: 10,
      },
    };

    render(<DesktopUpdateController />);

    expect(await screen.findByRole('status')).toHaveTextContent('Downloading Lacuna 0.2.4');
    expect(screen.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
  });

  it('shows an actionable error when a background check fails', async () => {
    updateState = {
      phase: 'error',
      mode: 'automatic',
      currentVersion: '0.2.3',
      error: 'Could not check for updates. Check your connection and try again.',
    };

    render(<DesktopUpdateController />);

    expect(await screen.findByRole('alert')).toHaveTextContent(updateState.error!);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });
});
