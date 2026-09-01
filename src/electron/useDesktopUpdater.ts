import { useCallback, useEffect, useState } from 'react';
import type { DesktopUpdateState } from './updateTypes';

export function useDesktopUpdater() {
  const updater = window.electronAPI?.updater;
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    if (!updater) return;
    let active = true;
    void updater.getState().then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = updater.onStateChange((next) => {
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
