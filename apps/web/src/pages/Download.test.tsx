import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectDesktopPlatform, DOWNLOADS, Download } from './Download';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop download selection', () => {
  it('links checksum guidance to the release containing both platform manifests', () => {
    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'View checksums and release files' })).toHaveAttribute(
      'href',
      DOWNLOADS.release,
    );
  });

  it('offers alternative downloads and their update differences before installation help', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
    render(<Download />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Windows portable · manual updates' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsPortable,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(screen.queryByRole('link', { name: /Windows portable/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Debian / Ubuntu DEB · manual updates' }),
    ).toHaveAttribute('href', DOWNLOADS.linuxDeb);
    expect(screen.getByRole('button', { name: 'Installation help' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('detects supported desktop platforms without mistaking Android for Linux', () => {
    expect(detectDesktopPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectDesktopPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(detectDesktopPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectDesktopPlatform('Mozilla/5.0 (Linux; Android 15)')).toBeNull();
    expect(
      detectDesktopPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'),
    ).toBeNull();
  });

  it('does not silently recommend a Windows executable to mobile visitors', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15)',
    });

    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByText('Choose your computer.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Installation help' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Download for Windows' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Windows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Windows' }));
    expect(screen.getByText('64-bit Windows · installer')).toBeVisible();
  });

  it('shows Windows expectations and browser handover beside the installer', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
    render(<Download />, { wrapper: MemoryRouter });
    expect(screen.getByText('64-bit Windows · installer')).toBeVisible();
    expect(screen.getByText('Automatic updates')).toBeVisible();
    expect(screen.getByText('Unsigned')).toBeVisible();
    expect(screen.getByText('Managed computers may block installation.')).toBeVisible();
    expect(screen.getByText('Browser data is not copied automatically.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back up in browser' })).toHaveAttribute(
      'href',
      '/settings#settings-export',
    );
    expect(screen.getByText('Import on desktop')).toBeVisible();
    expect(screen.getByText(/Prerelease · v/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsInstaller,
    );
    expect(screen.queryByText(/Run anyway/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/Run anyway only when you downloaded Lacuna/)).toBeVisible();
    expect(
      screen.getByText('Portable: no installer. Keep it in a folder you can access.'),
    ).toBeVisible();
  });

  it('keeps architecture and update differences accurate when platforms change and resets help', () => {
    render(<Download />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'macOS' }));
    expect(screen.getByText('Apple Silicon only')).toBeVisible();
    expect(screen.getByText('Manual updates')).toBeVisible();
    expect(screen.getByText('Unsigned')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      DOWNLOADS.macDmg,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText('Drag Lacuna into Applications.')).toBeVisible();
    expect(screen.getByText(/Open Anyway only when you downloaded Lacuna/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(screen.getByText('64-bit Linux · AppImage')).toBeVisible();
    expect(screen.getByText('Automatic updates')).toBeVisible();
    expect(screen.queryByText('Unsigned')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Installation help' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Download for Linux' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxAppImage,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/Allow the AppImage to run/)).toBeVisible();
  });
});
