import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { DownloadIcon } from '../../components/ui/icons';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export function InstallSection({ motionMultiplier }: { motionMultiplier: number }) {
  return (
    <motion.section
      id="settings-install"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.4 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <DownloadIcon width={18} height={18} />
        <h2 className="font-display text-xl">Install</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">Add Lacuna to your home screen for quick access and offline use.</p>
      <InstallPanel />
    </motion.section>
  );
}

function InstallPanel() {
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const isWindows = typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win');

  if (isInstalled) {
    return <p className="text-sm text-ink-soft">Lacuna is installed on this device and can be used offline.</p>;
  }

  if (!isInstallable) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">Your browser does not support installing web apps, or Lacuna is already installed.</p>
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
