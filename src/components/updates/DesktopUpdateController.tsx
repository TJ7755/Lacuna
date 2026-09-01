import { useState } from 'react';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useDesktopUpdater } from '../../electron/useDesktopUpdater';

export function DesktopUpdateController() {
  const { state, checkForUpdates, restartAndInstall } = useDesktopUpdater();
  const [laterVersion, setLaterVersion] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const availableVersion = state?.availableVersion;
  const showReadyDialog =
    state?.phase === 'downloaded' &&
    availableVersion !== undefined &&
    laterVersion !== availableVersion;

  if (
    state?.phase === 'checking' ||
    state?.phase === 'available' ||
    state?.phase === 'downloading'
  ) {
    return <UpdateProgressNotice state={state} />;
  }

  if (state?.phase === 'error' && state.error && dismissedError !== state.error) {
    return (
      <div
        role="alert"
        className="fixed bottom-6 right-6 z-[65] w-[min(24rem,calc(100vw-3rem))] rounded-xl border border-negative/40 bg-surface-raised/95 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur"
      >
        <p className="text-sm text-ink">{state.error}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDismissedError(state.error ?? null)}>
            Dismiss
          </Button>
          <Button size="sm" onClick={() => void checkForUpdates()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!showReadyDialog) return null;

  return (
    <UpdateReadyDialog
      version={availableVersion}
      onInstall={() => void restartAndInstall()}
      onLater={() => setLaterVersion(availableVersion)}
    />
  );
}

function UpdateProgressNotice({
  state,
}: {
  state: NonNullable<ReturnType<typeof useDesktopUpdater>['state']>;
}) {
  const downloading = state.phase === 'downloading';
  const label = downloading
    ? `Downloading Lacuna ${state.availableVersion ?? 'update'}`
    : state.phase === 'available'
      ? `Preparing Lacuna ${state.availableVersion ?? 'update'}`
      : 'Checking for Lacuna updates';

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[65] w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-line-strong bg-surface-raised/95 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{label}</span>
        {downloading && state.progress && (
          <span className="tabular text-xs text-ink-soft">
            {Math.round(state.progress.percent)}%
          </span>
        )}
      </div>
      {downloading && state.progress && (
        <ProgressBar
          className="mt-2"
          value={state.progress.percent / 100}
          label="Update download"
          height={4}
        />
      )}
    </div>
  );
}

function UpdateReadyDialog({
  version,
  onInstall,
  onLater,
}: {
  version: string;
  onInstall: () => void;
  onLater: () => void;
}) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-update-install]' });

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Update ready"
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onLater();
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl border border-line-strong bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Update ready</p>
        <h2 className="mt-2 font-display text-2xl tracking-tight">Restart to update Lacuna</h2>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Version {version} has finished downloading. Lacuna will close, install the update and
          reopen.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onLater}>
            Later
          </Button>
          <Button data-update-install variant="primary" onClick={onInstall}>
            Restart and install
          </Button>
        </div>
      </div>
    </div>
  );
}
