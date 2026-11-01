import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DownloadIcon, LacunaIcon } from '../components/ui/icons';
import { Button, buttonClassName } from '../components/ui/Button';
import { AnimatedDisclosure } from '../components/ui/AnimatedDisclosure';
import { StepSwap } from '../components/ui/StepSwap';
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
      <Button variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        Other {platform} download <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </Button>
      <AnimatedDisclosure open={expanded} innerClassName="download-alternative-content">
        {children}
      </AnimatedDisclosure>
    </div>
  );
}

function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${buttonClassName('primary', 'lg')} download-action`}>
      <DownloadIcon className="size-5" />
      {children}
    </a>
  );
}

function WindowsDownload() {
  return (
    <>
      <DownloadButton href={DOWNLOADS.windowsInstaller}>Download for Windows</DownloadButton>
      <p className="download-compatibility">64-bit Windows · installer</p>
    </>
  );
}

function MacDownload() {
  return (
    <>
      <DownloadButton href={DOWNLOADS.macDmg}>Download for macOS</DownloadButton>
      <p className="download-compatibility">Apple Silicon only</p>
    </>
  );
}

function LinuxDownload() {
  return (
    <>
      <DownloadButton href={DOWNLOADS.linuxAppImage}>Download for Linux</DownloadButton>
      <p className="download-compatibility">64-bit Linux · AppImage</p>
    </>
  );
}

function InstallationHelp({ platform }: { platform: DesktopPlatform | null }) {
  return (
    <section className="download-help" aria-label="Installation help">
      {platform === 'windows' && (
        <>
          <p>
            The installer sets up Lacuna with automatic updates. Managed computers may block
            installers.
          </p>
          <p>
            Lacuna is not yet code-signed. If Windows blocks it, use More info → Run anyway only
            when you downloaded Lacuna from this page.
          </p>
          <AlternativeDownload platform="Windows">
            <p>
              <a className="download-inline-link" href={DOWNLOADS.windowsPortable}>
                Download the Windows portable build
              </a>{' '}
              if you need no installer or administrator account. Keep it in a folder you can access.
              It uses manual updates.
            </p>
          </AlternativeDownload>
        </>
      )}
      {platform === 'macos' && (
        <>
          <p>
            Drag Lacuna into Applications. This build supports Apple Silicon Macs only and uses
            manual updates.
          </p>
          <p>
            Lacuna is not yet code-signed. Use Privacy &amp; Security → Open Anyway only when you
            downloaded Lacuna from this page.
          </p>
        </>
      )}
      {platform === 'linux' && (
        <>
          <p>
            Allow the AppImage to run in its file permissions, then open it. It uses automatic
            updates. Only grant permission when you downloaded Lacuna from this page.
          </p>
          <AlternativeDownload platform="Linux">
            <p>
              <a className="download-inline-link" href={DOWNLOADS.linuxDeb}>
                Download the DEB package
              </a>{' '}
              for Debian or Ubuntu. It uses manual updates.
            </p>
          </AlternativeDownload>
        </>
      )}
      <p>This is prerelease software. Keep a backup of important course data.</p>
      <p>Existing browser data is not copied into the desktop app automatically.</p>
    </section>
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
  const [helpOpen, setHelpOpen] = useState(false);
  const SelectedDownload = selected ? platformDownloads[selected] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="download-page">
      <nav className="download-nav" aria-label="Public navigation">
        <Link to="/landing" className="download-brand">
          <LacunaIcon className="size-7" /> Lacuna
        </Link>
        <Link to="/" className="download-browser-link">
          Open Lacuna <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <main className="download-main">
        <div className="download-choice">
          <header className="download-intro">
            <h1>Download Lacuna.</h1>
          </header>
          <div className="download-platforms" role="group" aria-label="Operating system">
            {(Object.keys(platformLabels) as DesktopPlatform[]).map((platform) => (
              <Button
                variant={selected === platform ? 'inverse' : 'secondary'}
                key={platform}
                type="button"
                aria-pressed={selected === platform}
                onClick={() => {
                  setSelected(platform);
                  setHelpOpen(false);
                }}
              >
                {platformLabels[platform]}
              </Button>
            ))}
          </div>
          <section className="download-selection" aria-live="polite" aria-atomic="true">
            <StepSwap stepKey={selected ?? 'none'}>
              {SelectedDownload ? (
                <SelectedDownload />
              ) : (
                <p className="download-compatibility">Choose your computer.</p>
              )}
            </StepSwap>
          </section>
        </div>
        <footer className="download-footer">
          <Button
            variant="ghost"
            aria-expanded={helpOpen}
            aria-controls="download-help"
            onClick={() => setHelpOpen(!helpOpen)}
          >
            Installation help
          </Button>
          <a href={DOWNLOADS.release} className="download-inline-link">
            View checksums and release files
          </a>
        </footer>
        <div id="download-help">
          <AnimatedDisclosure open={helpOpen}>
            <InstallationHelp platform={selected} />
          </AnimatedDisclosure>
        </div>
      </main>
    </div>
  );
}
