import { UpdateReadyDialog } from './UpdateReadyDialog';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { useDesktopUpdater } from '../../electron/useDesktopUpdater';
import { formatUpdateBytes } from '../../electron/updatePresentation';

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
      key={availableVersion}
      version={availableVersion}
      releaseNotes={state.releaseNotes}
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
        <>
          <ProgressBar
            className="mt-2"
            value={state.progress.percent / 100}
            label="Update download"
            height={4}
          />
          <p className="mt-1 text-right text-[11px] tabular text-ink-soft">
            {formatUpdateBytes(state.progress.transferred)} of{' '}
            {formatUpdateBytes(state.progress.total)}
          </p>
        </>
      )}
    </div>
  );
}
