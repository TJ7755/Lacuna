import { act, fireEvent, render, screen } from '@testing-library/react';
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
    expect(dialog).toHaveTextContent('Lacuna 0.2.4 is ready to install.');

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog', { name: 'Update ready' })).not.toBeInTheDocument();
    expect(restartAndInstall).not.toHaveBeenCalled();
  });

  it('discloses safe Markdown and GitHub HTML notes without remote media or executable links', async () => {
    updateState.releaseNotes =
      '- **Offline courses**\n\n<ul><li>Improved imports</li></ul><script>alert(1)</script><img src="https://example.com/tracker.png"><a href="javascript:alert(1)">Unsafe</a>';
    render(<DesktopUpdateController />);
    const dialog = await screen.findByRole('dialog', { name: 'Update ready' });
    const toggle = screen.getByRole('button', { name: 'What’s new' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Improved imports')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Improved imports')).toBeInTheDocument();
    expect(screen.getByText('Offline courses').tagName).toBe('STRONG');
    expect(dialog.querySelector('script, img, iframe, a[href^="javascript:"]')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByText('Improved imports')).not.toBeInTheDocument();
  });

  it('omits missing notes, traps focus and restores it after Escape', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    render(<DesktopUpdateController />);
    const dialog = await screen.findByRole('dialog', { name: 'Update ready' });
    expect(screen.queryByRole('button', { name: 'What’s new' })).not.toBeInTheDocument();
    const install = screen.getByRole('button', { name: 'Restart Lacuna' });
    expect(install).toHaveFocus();
    fireEvent.keyDown(install, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Later' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    trigger.remove();
    expect(restartAndInstall).not.toHaveBeenCalled();
  });

  it('installs only when the restart button is pressed', async () => {
    render(<DesktopUpdateController />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restart Lacuna' }));
    expect(restartAndInstall).toHaveBeenCalledOnce();
  });

  it('defers only the dismissed version and resets the disclosure for a newer update', async () => {
    let publish: ((state: DesktopUpdateState) => void) | undefined;
    vi.mocked(window.electronAPI!.updater!.onStateChange).mockImplementation((callback) => {
      publish = callback;
      return () => undefined;
    });
    updateState.releaseNotes = '- First notes';
    render(<DesktopUpdateController />);
    fireEvent.click(await screen.findByRole('button', { name: 'What’s new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    act(() => publish?.({ ...updateState }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() =>
      publish?.({ ...updateState, availableVersion: '0.2.5', releaseNotes: '- Next notes' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Lacuna 0.2.5 is ready to install.');
    expect(screen.getByRole('button', { name: 'What’s new' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows unobtrusive download progress outside Settings', async () => {
    updateState = {
      phase: 'downloading',
      mode: 'automatic',
      currentVersion: '0.2.3',
      availableVersion: '0.2.4',
      progress: {
        percent: 42,
        transferred: 25 * 1024 * 1024,
        total: 100 * 1024 * 1024,
        bytesPerSecond: 2 * 1024 * 1024,
      },
    };

    render(<DesktopUpdateController />);

    expect(await screen.findByRole('status')).toHaveTextContent('Downloading Lacuna 0.2.4');
    expect(screen.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(screen.getByText('25 MB of 100 MB')).toBeInTheDocument();
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
