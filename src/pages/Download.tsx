import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DownloadIcon } from '../components/ui/icons';
import { PublicHeader } from '../components/welcome/PublicHeader';

declare const __APP_VERSION__: string;

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.2.3';
const RELEASE_BASE = `https://github.com/TJ7755/Lacuna/releases/download/v${APP_VERSION}`;

export const DOWNLOADS = {
  windowsPortable: `${RELEASE_BASE}/Lacuna-Portable-${APP_VERSION}.exe`,
  windowsInstaller: `${RELEASE_BASE}/Lacuna-Setup-${APP_VERSION}.exe`,
  macDmg: `${RELEASE_BASE}/Lacuna-${APP_VERSION}-arm64.dmg`,
  linuxAppImage: `${RELEASE_BASE}/Lacuna-${APP_VERSION}.AppImage`,
  linuxDeb: `${RELEASE_BASE}/lacuna_${APP_VERSION}_amd64.deb`,
  checksums: `${RELEASE_BASE}/SHA256SUMS.txt`,
} as const;

export function detectDesktopPlatform(userAgent: string): DesktopPlatform | null {
  if (/android|iphone|ipad|ipod|mobile/i.test(userAgent)) return null;
  if (/windows/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  if (/linux/i.test(userAgent)) return 'linux';
  return null;
}

const platformLabels: Record<DesktopPlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="shadow-paper shadow-paper-hover inline-flex min-h-14 items-center justify-center gap-3 rounded-[10px] border border-accent-ink/40 bg-accent px-6 font-semibold text-accent-fg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      <DownloadIcon className="size-5" />
      {children}
    </a>
  );
}

function WindowsDownload() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Recommended for locked-down computers
      </p>
      <h2 className="mt-3 text-3xl text-balance sm:text-4xl">Windows portable</h2>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
        Best for school and work computers. It needs no installer or administrator account: download
        it, keep it in a folder you can access, then run it.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <DownloadButton href={DOWNLOADS.windowsPortable}>Download for Windows</DownloadButton>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          x64 · manual updates
        </span>
      </div>
      <div className="mt-7 border-t border-line pt-5 text-sm leading-relaxed text-ink-soft">
        <p>
          Want automatic updates?{' '}
          <a
            className="font-medium text-accent underline underline-offset-4"
            href={DOWNLOADS.windowsInstaller}
          >
            Download the Windows installer
          </a>
          . A managed computer may block installers even when they do not request administrator
          access.
        </p>
      </div>
    </div>
  );
}

function MacDownload() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        macOS download
      </p>
      <h2 className="mt-3 text-3xl text-balance sm:text-4xl">Apple Silicon Mac</h2>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
        Download the disk image, drag Lacuna into Applications, then open it. This build supports
        M-series Macs; Intel Macs are not supported in this beta.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <DownloadButton href={DOWNLOADS.macDmg}>Download for macOS</DownloadButton>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Apple Silicon · manual updates
        </span>
      </div>
    </div>
  );
}

function LinuxDownload() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Recommended Linux download
      </p>
      <h2 className="mt-3 text-3xl text-balance sm:text-4xl">Linux AppImage</h2>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
        No system installation is needed. Download the file, allow it to run as a program in its
        file permissions, then open it.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <DownloadButton href={DOWNLOADS.linuxAppImage}>Download for Linux</DownloadButton>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          x64 · automatic updates
        </span>
      </div>
      <div className="mt-7 border-t border-line pt-5 text-sm leading-relaxed text-ink-soft">
        <p>
          On Debian or Ubuntu?{' '}
          <a
            className="font-medium text-accent underline underline-offset-4"
            href={DOWNLOADS.linuxDeb}
          >
            Download the DEB package
          </a>
          . It installs through the system package manager and updates manually.
        </p>
      </div>
    </div>
  );
}

const platformDownloads: Record<DesktopPlatform, () => ReactNode> = {
  windows: WindowsDownload,
  macos: MacDownload,
  linux: LinuxDownload,
};

export function Download() {
  const detected = detectDesktopPlatform(navigator.userAgent);
  const [selected, setSelected] = useState<DesktopPlatform | null>(detected);
  const SelectedDownload = selected ? platformDownloads[selected] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <header className="border-b border-line bg-dot-grid">
        <PublicHeader />
        <div className="mx-auto max-w-3xl px-6 pb-14 pt-14 sm:px-10 sm:pb-20 sm:pt-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            Desktop beta · version {APP_VERSION}
          </p>
          <h1 className="mt-5 text-5xl leading-[1.05] text-balance sm:text-7xl">
            Download Lacuna.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">
            The same Lacuna as the web app, packaged for your computer. Your courses and review
            history stay on this device. Existing browser data is not copied into the desktop app
            automatically.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14 sm:px-10 sm:py-20">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Choose your computer
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Operating system">
            {(Object.keys(platformLabels) as DesktopPlatform[]).map((platform) => (
              <button
                key={platform}
                type="button"
                aria-pressed={selected === platform}
                onClick={() => setSelected(platform)}
                className={
                  'min-h-11 rounded-lg border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ' +
                  (selected === platform
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line-strong bg-surface-raised text-ink-soft hover:border-accent/60 hover:text-ink')
                }
              >
                {platformLabels[platform]}
              </button>
            ))}
          </div>
        </div>

        <section className="shadow-paper mt-8 rounded-[14px] border border-line-strong bg-surface-raised p-7 sm:p-10">
          {SelectedDownload ? (
            <SelectedDownload />
          ) : (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                Desktop download
              </p>
              <h2 className="mt-3 text-3xl text-balance sm:text-4xl">Choose your computer</h2>
              <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
                Lacuna’s desktop app runs on Windows, macOS and Linux. Choose the computer where
                you plan to use it to see the correct download and setup guidance.
              </p>
            </div>
          )}
        </section>

        <section className="mt-10 rounded-[10px] border border-warning/40 bg-warning/10 p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-warning-fg">
            Before you open the beta
          </p>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
            {selected === 'windows' && (
              <p>
                Lacuna is not yet code-signed. Windows may show “Windows protected your PC”; use
                <span className="font-medium text-ink"> More info → Run anyway</span>{' '}
                only when you downloaded Lacuna from this page.
              </p>
            )}
            {selected === 'macos' && (
              <p>
                Lacuna is not yet code-signed. macOS will block the first launch; use
                <span className="font-medium text-ink"> Privacy &amp; Security → Open Anyway</span>{' '}
                only when you downloaded Lacuna from this page.
              </p>
            )}
            {selected === 'linux' && (
              <p>
                Some desktop environments will ask you to confirm that the AppImage may run. Only
                grant that permission when you downloaded Lacuna from this page.
              </p>
            )}
            <p>This is prerelease software. Keep a current backup of important course data.</p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-sm text-ink-faint">
          <p>
            No download needed?{' '}
            <Link to="/" className="text-accent underline underline-offset-4">
              Use Lacuna in your browser
            </Link>
            .
          </p>
          <a
            href={DOWNLOADS.checksums}
            className="underline underline-offset-4 hover:text-ink-soft"
          >
            Verify SHA-256 checksums
          </a>
        </div>
      </main>
    </div>
  );
}
