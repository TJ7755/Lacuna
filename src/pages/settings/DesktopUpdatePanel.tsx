import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useDesktopUpdater } from '../../electron/useDesktopUpdater';
import type { ManualUpdateReason } from '../../electron/updateTypes';

const MANUAL_UPDATE_COPY: Record<ManualUpdateReason, string> = {
  development: 'This development build does not check for packaged updates.',
  'unsigned-macos':
    'This unsigned macOS beta updates manually. Download the new Apple Silicon build and replace the existing app.',
  'windows-portable':
    'Portable Windows builds update manually. Download the new portable executable and replace the old one.',
  'linux-deb':
    'DEB packages update manually. Download the new package and install it with your package manager.',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function DesktopUpdatePanel() {
  const { state, checkForUpdates, restartAndInstall } = useDesktopUpdater();

  if (!state) return <p className="text-sm text-ink-soft">Loading update status…</p>;

  if (state.mode === 'manual') {
    return (
      <div className="border-t border-line pt-5">
        <div className="text-sm font-medium text-ink">Desktop updates</div>
        <p className="mt-1 text-sm text-ink-soft">Version {state.currentVersion}</p>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {MANUAL_UPDATE_COPY[state.manualReason ?? 'development']}{' '}
          <a
            href="https://github.com/TJ7755/Lacuna/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Download the latest release
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-line pt-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-ink">Desktop updates</div>
          <p className="mt-1 text-sm text-ink-soft">Version {state.currentVersion}</p>
        </div>
        {state.phase === 'downloaded' ? (
          <Button size="sm" variant="primary" onClick={() => void restartAndInstall()}>
            Restart and install
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={
              state.phase === 'checking' ||
              state.phase === 'available' ||
              state.phase === 'downloading'
            }
            onClick={() => void checkForUpdates()}
          >
            {state.phase === 'checking'
              ? 'Checking…'
              : state.phase === 'available'
                ? 'Preparing…'
                : state.phase === 'error'
                  ? 'Try again'
                  : 'Check for updates'}
          </Button>
        )}
      </div>
      {state.phase === 'error' && state.error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.phase === 'up-to-date' && (
        <p className="mt-3 text-sm text-positive">Lacuna is up to date.</p>
      )}
      {state.phase === 'idle' && (
        <p className="mt-3 text-sm text-ink-soft">Lacuna checks automatically after launch.</p>
      )}
      {state.phase === 'available' && (
        <p className="mt-3 text-sm text-ink-soft">
          Version {state.availableVersion} is available. Preparing the download…
        </p>
      )}
      {state.phase === 'downloaded' && (
        <p className="mt-3 text-sm text-positive">
          Version {state.availableVersion} is ready to install. Lacuna will restart only when you
          choose.
        </p>
      )}
      {state.phase === 'downloading' && state.progress && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-soft">
            <span>Downloading version {state.availableVersion}</span>
            <span className="tabular">
              {formatBytes(state.progress.transferred)} of {formatBytes(state.progress.total)}
            </span>
          </div>
          <ProgressBar value={state.progress.percent / 100} label="Update download" height={6} />
        </div>
      )}
    </div>
  );
}
