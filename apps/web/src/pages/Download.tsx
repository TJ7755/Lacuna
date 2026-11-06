import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertIcon,
  ArrowRightIcon,
  DownloadIcon,
  LacunaIcon,
  LockIcon,
  RefreshIcon,
  UploadIcon,
} from '../components/ui/icons';
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

function AlternativeDownload({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="download-alternative download-inline-link">
      <DownloadIcon width={16} height={16} />
      {children}
    </a>
  );
}

function DownloadStatus({
  automatic,
  unsigned = false,
}: {
  automatic: boolean;
  unsigned?: boolean;
}) {
  return (
    <p className="download-status">
      {unsigned && (
        <span>
          <AlertIcon width={16} height={16} />
          Unsigned
        </span>
      )}
      <span>
        <RefreshIcon width={16} height={16} />
        {automatic ? 'Automatic updates' : 'Manual updates'}
      </span>
    </p>
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
      <DownloadStatus automatic unsigned />
      <AlternativeDownload href={DOWNLOADS.windowsPortable}>
        Windows portable · manual updates
      </AlternativeDownload>
    </>
  );
}

function MacDownload() {
  return (
    <>
      <DownloadButton href={DOWNLOADS.macDmg}>Download for macOS</DownloadButton>
      <p className="download-compatibility">Apple Silicon only</p>
      <DownloadStatus automatic={false} unsigned />
    </>
  );
}

function LinuxDownload() {
  return (
    <>
      <DownloadButton href={DOWNLOADS.linuxAppImage}>Download for Linux</DownloadButton>
      <p className="download-compatibility">64-bit Linux · AppImage</p>
      <DownloadStatus automatic />
      <AlternativeDownload href={DOWNLOADS.linuxDeb}>
        Debian / Ubuntu DEB · manual updates
      </AlternativeDownload>
    </>
  );
}

function InstallationHelp({ platform }: { platform: DesktopPlatform | null }) {
  return (
    <section className="download-help" aria-label="Installation help">
      {platform === 'windows' && (
        <>
          <p>
            Lacuna is not yet code-signed. If Windows blocks it, use More info → Run anyway only
            when you downloaded Lacuna from this page.
          </p>
          <p>Portable: no installer. Keep it in a folder you can access.</p>
        </>
      )}
      {platform === 'macos' && (
        <>
          <p>Drag Lacuna into Applications.</p>
          <p>
            Lacuna is not yet code-signed. Use Privacy &amp; Security → Open Anyway only when you
            downloaded Lacuna from this page.
          </p>
        </>
      )}
      {platform === 'linux' && (
        <>
          <p>
            Allow the AppImage to run in its file permissions, then open it. Only grant permission
            when you downloaded Lacuna from this page.
          </p>
        </>
      )}
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
          Open Lacuna <ArrowRightIcon className="-rotate-45" />
        </Link>
      </nav>
      <main className="download-main">
        <div className="download-choice">
          <header className="download-intro">
            <h1>Download Lacuna.</h1>
            <p className="download-prerelease">
              <AlertIcon width={16} height={16} />
              Prerelease · v{APP_VERSION}
            </p>
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
          {selected && (
            <p className="download-managed">
              <LockIcon width={16} height={16} />
              Managed computers may block installation.
            </p>
          )}
          <section className="download-transfer" aria-label="Move browser data to desktop">
            <p>Browser data is not copied automatically.</p>
            <ol>
              <li>
                <Link to="/settings#settings-export" className="download-inline-link">
                  <DownloadIcon width={18} height={18} />
                  Back up in browser
                </Link>
                <ArrowRightIcon />
              </li>
              <li>
                <UploadIcon width={18} height={18} />
                Import on desktop
              </li>
            </ol>
          </section>
        </div>
        <footer className="download-footer">
          <Button
            variant="ghost"
            disabled={!selected}
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
