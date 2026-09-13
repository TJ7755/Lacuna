import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectDesktopPlatform, DOWNLOADS, Download } from './Download';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop download selection', () => {
  it('keeps the initial download choice to one compatibility line', () => {
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' });
    const { container } = render(<Download />, { wrapper: MemoryRouter });
    expect(container.querySelectorAll('main p')).toHaveLength(1);
    expect(screen.queryByText(/Desktop beta.*version/)).not.toBeInTheDocument();
    expect(screen.queryByText('Your revision. On your computer.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Download Lacuna.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      DOWNLOADS.macDmg,
    );
    expect(screen.queryByText(/drag Lacuna/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/Privacy & Security/)).toBeVisible();
  });

  it('links to the current desktop release', () => {
    expect(DOWNLOADS.windowsPortable).toContain('/releases/download/v0.2.5/');
    expect(DOWNLOADS.macDmg).toContain('/releases/download/v0.2.5/');
    expect(DOWNLOADS.linuxAppImage).toContain('/releases/download/v0.2.5/');
    expect(DOWNLOADS.release).toBe('https://github.com/TJ7755/Lacuna/releases/tag/v0.2.5');
  });

  it('links checksum guidance to the release containing both platform manifests', () => {
    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'View checksums and release files' })).toHaveAttribute(
      'href',
      DOWNLOADS.release,
    );
  });

  it('reveals alternative packages only when requested', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
    render(<Download />, { wrapper: MemoryRouter });

    expect(
      screen.queryByRole('link', { name: 'Download the Windows installer' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other Windows download' }));
    expect(screen.getByRole('link', { name: 'Download the Windows installer' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsInstaller,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(
      screen.queryByRole('link', { name: 'Download the DEB package' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other Linux download' }));
    expect(screen.getByRole('link', { name: 'Download the DEB package' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxDeb,
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
    expect(screen.queryByRole('link', { name: 'Download for Windows' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Windows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Windows' }));
    expect(screen.getByText('64-bit Windows · portable')).toBeVisible();
  });

  it('recommends the no-admin portable build on Windows and explains its update trade-off', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByText('64-bit Windows · portable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/no installer or administrator account/i)).toBeVisible();
    expect(screen.getByText(/browser data is not copied/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsPortable,
    );
    expect(screen.getByText(/It uses manual updates/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Other Windows download' }));
    expect(screen.getByRole('link', { name: 'Download the Windows installer' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsInstaller,
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('Run anyway only when you downloaded Lacuna') === true,
      ),
    ).toBeVisible();
  });

  it('keeps other platforms available with accurate architecture and update guidance', () => {
    render(<Download />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'macOS' }));
    expect(screen.getByText('Apple Silicon only')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/Apple Silicon Macs only and uses manual updates/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      DOWNLOADS.macDmg,
    );
    expect(screen.getByText(/Privacy & Security/)).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('Open Anyway only when you downloaded Lacuna') === true,
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(screen.getByText('64-bit Linux · AppImage')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/It uses automatic updates/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Linux' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxAppImage,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other Linux download' }));
    expect(screen.getByRole('link', { name: 'Download the DEB package' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxDeb,
    );
  });
});
