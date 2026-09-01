import { Button } from '../../components/ui/Button';
import { DownloadIcon, IosShareIcon } from '../../components/ui/icons';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { DesktopUpdatePanel } from './DesktopUpdatePanel';

export function InstallSection() {
  return (
    <section
      id="settings-install"
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <DownloadIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl">
          {window.electronAPI?.isElectron ? 'Install & updates' : 'Install'}
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        {window.electronAPI?.isElectron
          ? 'Keep the desktop application current.'
          : 'Add Lacuna to your home screen for quick access and offline use.'}
      </p>
      <InstallPanel />
    </section>
  );
}

function InstallPanel() {
  const { isInstalled, method, promptInstall } = useInstallPrompt();
  const isWindows = typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win');

  if (window.electronAPI?.isElectron) return <DesktopUpdatePanel />;

  if (isInstalled) {
    return <p className="text-sm text-ink-soft">Lacuna is installed on this device and can be used offline.</p>;
  }

  // iOS cannot offer a one-tap install, so the panel teaches the gesture instead. The
  // glyph is shown inline because the user has to recognise that button on their own
  // screen; naming it alone is not enough to find it.
  if (method === 'manual-ios') {
    return (
      <p className="text-sm text-ink-soft">
        Tap{' '}
        <IosShareIcon width={16} height={16} className="inline-block align-text-bottom text-accent" />
        <span className="sr-only">Share</span> in the Safari toolbar, then choose Add to Home
        Screen. Lacuna opens like any other app and works offline.
      </p>
    );
  }

  if (method === 'unavailable') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">This browser cannot install web apps.</p>
        {isWindows && <DesktopDownload />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">Install Lacuna as a standalone app for offline access and a native-like experience.</p>
        <Button variant="secondary" onClick={promptInstall}>
          <DownloadIcon width={18} height={18} />
          Install
        </Button>
      </div>
      {isWindows && <DesktopDownload prefix="On Windows, you can also download" />}
    </div>
  );
}

function DesktopDownload({ prefix = 'On Windows, you can download' }: { prefix?: string }) {
  return (
    <p className="text-sm text-ink-soft">
      {prefix} the desktop app from the{' '}
      <a href="https://github.com/TJ7755/Lacuna/releases" target="_blank" rel="noopener noreferrer" className="text-accent underline">
        GitHub releases page
      </a>
      .
    </p>
  );
}
