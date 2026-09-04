import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectDesktopPlatform, DOWNLOADS, Download } from './Download';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop download selection', () => {
  it('links to the current desktop release', () => {
    expect(DOWNLOADS.windowsPortable).toContain('/releases/download/v0.2.5/');
    expect(DOWNLOADS.macDmg).toContain('/releases/download/v0.2.5/');
    expect(DOWNLOADS.linuxAppImage).toContain('/releases/download/v0.2.5/');
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

    expect(screen.getByRole('heading', { name: 'Choose your computer' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Windows portable' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Windows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Windows' }));
    expect(screen.getByRole('heading', { name: 'Windows portable' })).toBeVisible();
  });

  it('recommends the no-admin portable build on Windows and explains its update trade-off', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: 'Windows portable' })).toBeVisible();
    expect(screen.getByText(/no installer or administrator account/i)).toBeVisible();
    expect(screen.getByText(/browser data is not copied/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      DOWNLOADS.windowsPortable,
    );
    expect(screen.getByText('x64 · manual updates')).toBeVisible();
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
    expect(screen.getByRole('heading', { name: 'Apple Silicon Mac' })).toBeVisible();
    expect(screen.getByText('Apple Silicon · manual updates')).toBeVisible();
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
    expect(screen.getByRole('heading', { name: 'Linux AppImage' })).toBeVisible();
    expect(screen.getByText('x64 · automatic updates')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Linux' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxAppImage,
    );
    expect(screen.getByRole('link', { name: 'Download the DEB package' })).toHaveAttribute(
      'href',
      DOWNLOADS.linuxDeb,
    );
  });
});
