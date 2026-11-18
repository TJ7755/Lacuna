import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Download } from './Download';

const { releaseVersion } = vi.hoisted(() => {
  const releaseVersion = '9.8.7';
  vi.stubGlobal('__APP_VERSION__', releaseVersion);
  return { releaseVersion };
});
const releaseBase = `https://github.com/TJ7755/Lacuna/releases/download/v${releaseVersion}`;

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
      `https://github.com/TJ7755/Lacuna/releases/tag/v${releaseVersion}`,
    );
  });

  it('reveals alternative packages only when requested', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
    render(<Download />, { wrapper: MemoryRouter });

    expect(
      screen.queryByRole('link', { name: 'Download the Windows portable build' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other Windows download' }));
    expect(
      screen.getByRole('link', { name: 'Download the Windows portable build' }),
    ).toHaveAttribute('href', `${releaseBase}/Lacuna-Portable-${releaseVersion}.exe`);
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }));
    expect(
      screen.queryByRole('link', { name: 'Download the DEB package' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other Linux download' }));
    expect(screen.getByRole('link', { name: 'Download the DEB package' })).toHaveAttribute(
      'href',
      `${releaseBase}/lacuna_${releaseVersion}_amd64.deb`,
    );
  });

  it.each([
    ['Windows NT 10.0; Win64; x64', '', 0, 'Windows'],
    ['Macintosh; Intel Mac OS X 10_15_7', 'MacIntel', 0, 'macOS'],
    ['X11; Linux x86_64', '', 0, 'Linux'],
    ['Linux; Android 15', '', 0, null],
    ['iPhone; CPU iPhone OS 18_0 like Mac OS X Mobile', '', 0, null],
    ['Macintosh; Intel Mac OS X 10_15_7', 'MacIntel', 5, null],
  ])(
    'offers the appropriate download for %s on %s with %i touch points',
    (userAgent, platform, maxTouchPoints, selected) => {
      vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });
      render(<Download />, { wrapper: MemoryRouter });
      if (selected) {
        expect(screen.getByRole('button', { name: selected })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        expect(screen.getByRole('link', { name: `Download for ${selected}` })).toBeVisible();
      } else {
        expect(screen.getByText('Choose your computer.')).toBeVisible();
        expect(screen.queryByRole('link', { name: /^Download for/ })).not.toBeInTheDocument();
      }
    },
  );

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
    expect(screen.getByText('64-bit Windows installer')).toBeVisible();
  });

  it('recommends the Windows installer with automatic updates and keeps portable optional', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    render(<Download />, { wrapper: MemoryRouter });

    expect(screen.getByText('64-bit Windows installer')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/installer sets up Lacuna with automatic updates/i)).toBeVisible();
    expect(screen.getByText(/browser data is not copied/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      `${releaseBase}/Lacuna-Setup-${releaseVersion}.exe`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other Windows download' }));
    expect(
      screen.getByRole('link', { name: 'Download the Windows portable build' }),
    ).toHaveAttribute('href', `${releaseBase}/Lacuna-Portable-${releaseVersion}.exe`);
    expect(screen.getByText(/no installer or administrator account/i)).toBeVisible();
    expect(screen.getByText(/It uses manual updates/)).toBeVisible();
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
      `${releaseBase}/Lacuna-${releaseVersion}-arm64.dmg`,
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
    expect(screen.getByText('64-bit Linux AppImage')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Installation help' }));
    expect(screen.getByText(/It uses automatic updates/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download for Linux' })).toHaveAttribute(
      'href',
      `${releaseBase}/Lacuna-${releaseVersion}.AppImage`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other Linux download' }));
    expect(screen.getByRole('link', { name: 'Download the DEB package' })).toHaveAttribute(
      'href',
      `${releaseBase}/lacuna_${releaseVersion}_amd64.deb`,
    );
  });
});
