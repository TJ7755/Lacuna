import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useIsPresent } from 'motion/react';

/** Keep delayed save feedback owned by the editor route that started it. */
export function useEditorReturn(identity: string) {
  const isPresent = useIsPresent();
  const lifetime = useMemo(() => ({
    identity,
    active: isPresent,
    timer: undefined as number | undefined,
  }), [identity, isPresent]);

  useLayoutEffect(() => {
    lifetime.active = isPresent;
    return () => {
      lifetime.active = false;
      window.clearTimeout(lifetime.timer);
    };
  }, [lifetime, isPresent]);

  return useCallback((callback: () => void) => {
    // A database write may finish after this route has already departed.
    if (!lifetime.active) return;
    window.clearTimeout(lifetime.timer);
    lifetime.timer = window.setTimeout(() => {
      if (lifetime.active) callback();
    }, 450);
  }, [lifetime]);
}
