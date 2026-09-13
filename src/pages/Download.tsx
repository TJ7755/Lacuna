import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DownloadIcon, LacunaIcon } from '../components/ui/icons';
import './Download.css';

declare const __APP_VERSION__: string;

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.2.5';
const RELEASE_BASE = `https://github.com/TJ7755/Lacuna/releases/download/v${APP_VERSION}`;
const RELEASE_PAGE = `https://github.com/TJ7755/Lacuna/releases/tag/v${APP_VERSION}`;

export const DOWNLOADS = {
  windowsPortable: `${RELEASE_BASE}/Lacuna-Portable-${APP_VERSION}.exe`,
  windowsInstaller: `${RELEASE_BASE}/Lacuna-Setup-${APP_VERSION}.exe`,
  macDmg: `${RELEASE_BASE}/Lacuna-${APP_VERSION}-arm64.dmg`,
  linuxAppImage: `${RELEASE_BASE}/Lacuna-${APP_VERSION}.AppImage`,
  linuxDeb: `${RELEASE_BASE}/lacuna_${APP_VERSION}_amd64.deb`,
  release: RELEASE_PAGE,
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

function AlternativeDownload({ platform, children }: { platform: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="download-alternative">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        Other {platform} download <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && <div className="download-alternative-content">{children}</div>}
    </div>
  );
}

function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="download-action">
      <DownloadIcon className="size-5" />
      {children}
    </a>
  );
}

function WindowsDownload() {
  return (
    <div>
      <p className="download-eyebrow">Recommended for locked-down computers</p>
      <h2 className="download-choice-title">Windows portable</h2>
      <p className="download-description">
        Best for school and work computers. It needs no installer or administrator account: download
        it, keep it in a folder you can access, then run it.
      </p>
      <div className="download-action-group">
        <DownloadButton href={DOWNLOADS.windowsPortable}>Download for Windows</DownloadButton>
        <span className="download-meta">x64 · manual updates</span>
      </div>
      <AlternativeDownload platform="Windows">
        <p>
          Want automatic updates?{' '}
          <a className="download-inline-link" href={DOWNLOADS.windowsInstaller}>
            Download the Windows installer
          </a>
          . A managed computer may block installers even when they do not request administrator
          access.
        </p>
      </AlternativeDownload>
    </div>
  );
}

function MacDownload() {
  return (
    <div>
      <p className="download-eyebrow">macOS download</p>
      <h2 className="download-choice-title">Apple Silicon Mac</h2>
      <p className="download-description">
        Download the disk image, drag Lacuna into Applications, then open it. This build supports
        M-series Macs; Intel Macs are not supported in this beta.
      </p>
      <div className="download-action-group">
        <DownloadButton href={DOWNLOADS.macDmg}>Download for macOS</DownloadButton>
        <span className="download-meta">Apple Silicon · manual updates</span>
      </div>
    </div>
  );
}

function LinuxDownload() {
  return (
    <div>
      <p className="download-eyebrow">Recommended Linux download</p>
      <h2 className="download-choice-title">Linux AppImage</h2>
      <p className="download-description">
        No system installation is needed. Download the file, allow it to run as a program in its
        file permissions, then open it.
      </p>
      <div className="download-action-group">
        <DownloadButton href={DOWNLOADS.linuxAppImage}>Download for Linux</DownloadButton>
        <span className="download-meta">x64 · automatic updates</span>
      </div>
      <AlternativeDownload platform="Linux">
        <p>
          On Debian or Ubuntu?{' '}
          <a className="download-inline-link" href={DOWNLOADS.linuxDeb}>
            Download the DEB package
          </a>
          . It installs through the system package manager and updates manually.
        </p>
      </AlternativeDownload>
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
    <div className="download-page">
      <nav className="download-nav" aria-label="Public navigation">
        <Link to="/landing?variant=motion" className="download-brand">
          <LacunaIcon className="size-7" /> Lacuna
        </Link>
        <Link to="/" className="download-browser-link">
          Open Lacuna <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <main className="download-main">
        <header className="download-intro">
          <p className="download-eyebrow">Desktop beta · version {APP_VERSION}</p>
          <h1>Download Lacuna.</h1>
          <p>Your revision. On your computer.</p>
        </header>
        <div className="download-platforms" role="group" aria-label="Operating system">
          {(Object.keys(platformLabels) as DesktopPlatform[]).map((platform) => (
            <button
              key={platform}
              type="button"
              aria-pressed={selected === platform}
              onClick={() => setSelected(platform)}
            >
              {platformLabels[platform]}
            </button>
          ))}
        </div>
        <section className="download-selection" aria-live="polite" aria-atomic="true">
          {SelectedDownload ? (
            <SelectedDownload />
          ) : (
            <div>
              <h2 className="download-choice-title">Choose your computer</h2>
              <p className="download-description">
                Select Windows, macOS or Linux to find your download.
              </p>
            </div>
          )}
        </section>

        <section className="download-guidance">
          <p className="download-guidance-title">Before you open the beta</p>
          <div className="download-guidance-copy">
            {selected === 'windows' && (
              <p>
                Lacuna is not yet code-signed. Windows may show “Windows protected your PC”; use
                <span className="download-emphasis"> More info → Run anyway</span> only when you
                downloaded Lacuna from this page.
              </p>
            )}
            {selected === 'macos' && (
              <p>
                Lacuna is not yet code-signed. macOS will block the first launch; use
                <span className="download-emphasis">
                  {' '}
                  Privacy &amp; Security → Open Anyway
                </span>{' '}
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

        <section className="download-data">
          <h2>Your data stays yours.</h2>
          <p>
            Your courses and review history stay on this device. Existing browser data is not copied
            into the desktop app automatically.
          </p>
        </section>
        <footer className="download-footer">
          <p>
            No download needed?{' '}
            <Link to="/" className="download-inline-link">
              Use Lacuna in your browser
            </Link>
            .
          </p>
          <a href={DOWNLOADS.release} className="download-inline-link">
            View checksums and release files
          </a>
        </footer>
      </main>
    </div>
  );
}
