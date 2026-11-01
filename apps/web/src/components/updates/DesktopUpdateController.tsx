import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';
import { UpdateReadyDialog } from './UpdateReadyDialog';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
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

  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const progress =
    state?.phase === 'checking' || state?.phase === 'available' || state?.phase === 'downloading';
  const error = state?.phase === 'error' && state.error && dismissedError !== state.error;

  return (
    <AnimatePresence>
      {progress ? (
        <UpdateNotice key="progress" multiplier={m}>
          <UpdateProgressNotice state={state} multiplier={m} />
        </UpdateNotice>
      ) : error ? (
        <UpdateNotice key="error" multiplier={m}>
          <div role="alert">
            <p className="text-sm text-ink">{state.error}</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissedError(state.error ?? null)}
              >
                Dismiss
              </Button>
              <Button size="sm" onClick={() => void checkForUpdates()}>
                Try again
              </Button>
            </div>
          </div>
        </UpdateNotice>
      ) : (
        showReadyDialog && (
          <UpdateReadyDialog
            key={availableVersion}
            version={availableVersion}
            releaseNotes={state.releaseNotes}
            onInstall={() => void restartAndInstall()}
            onLater={() => setLaterVersion(availableVersion)}
          />
        )
      )}
    </AnimatePresence>
  );
}

function UpdateNotice({ children, multiplier }: { children: React.ReactNode; multiplier: number }) {
  const present = useIsPresent();
  return (
    <motion.div
      inert={!present}
      aria-hidden={!present || undefined}
      initial={multiplier > 0 ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={multiplier > 0 ? { opacity: 0, y: 16 } : undefined}
      transition={scaledSpring(multiplier, 320, 30)}
      className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[65] w-[min(24rem,calc(100vw-2rem))] rounded-3xl bg-surface p-5 card-surface"
    >
      {children}
    </motion.div>
  );
}

function UpdateProgressNotice({
  state,
  multiplier,
}: {
  multiplier: number;
  state: NonNullable<ReturnType<typeof useDesktopUpdater>['state']>;
}) {
  const downloading = state.phase === 'downloading';
  const label = downloading
    ? `Downloading Lacuna ${state.availableVersion ?? 'update'}`
    : state.phase === 'available'
      ? `Preparing Lacuna ${state.availableVersion ?? 'update'}`
      : 'Checking for Lacuna updates';

  return (
    <div role="status">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{label}</span>
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
            motionMultiplier={multiplier}
            value={state.progress.percent / 100}
            label="Update download"
            height={4}
          />
        </>
      )}
    </div>
  );
}
