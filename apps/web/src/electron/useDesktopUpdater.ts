import { useCallback, useEffect, useState } from 'react';
import type { DesktopUpdateState } from './updateTypes';

export function useDesktopUpdater() {
  const updater = window.electronAPI?.updater;
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    if (!updater) return;
    let active = true;
    let receivedUpdate = false;
    void updater.getState().then((next) => {
      // A notification can overtake the IPC snapshot. It owns the newer state.
      if (active && !receivedUpdate) setState(next);
    });
    const unsubscribe = updater.onStateChange((next) => {
      receivedUpdate = true;
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [updater]);

  const checkForUpdates = useCallback(
    () => updater?.checkForUpdates() ?? Promise.resolve(),
    [updater],
  );
  const restartAndInstall = useCallback(
    () => updater?.restartAndInstall() ?? Promise.resolve(),
    [updater],
  );

  return { state, checkForUpdates, restartAndInstall };
}
