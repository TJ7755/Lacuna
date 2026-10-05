import { useEffect, useMemo, useState } from 'react';

/** Save feedback belongs to one editor route; leaving it cancels its delayed return. */
export function useCardSaveConfirmation(draftKey: string) {
  const [showSaved, setShowSaved] = useState(false);
  const scope = useMemo(
    () => ({
      draftKey,
      active: true,
      savedTimer: undefined as number | undefined,
      returnTimer: undefined as number | undefined,
    }),
    [draftKey],
  );

  useEffect(() => {
    scope.active = true;
    setShowSaved(false);
    return () => {
      scope.active = false;
      window.clearTimeout(scope.savedTimer);
      window.clearTimeout(scope.returnTimer);
    };
  }, [scope]);

  function flashSaved() {
    if (!scope.active) return;
    window.clearTimeout(scope.savedTimer);
    setShowSaved(true);
    scope.savedTimer = window.setTimeout(() => setShowSaved(false), 1200);
  }

  function afterSaved(onConfirmed: () => void) {
    if (!scope.active) return;
    window.clearTimeout(scope.returnTimer);
    scope.returnTimer = window.setTimeout(onConfirmed, 450);
  }

  return { showSaved, flashSaved, afterSaved };
}
