import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Fast reads stay quiet; a displayed loader gets enough time to avoid a one-frame flash. */
export function useLoadingVisibility(pending: boolean, delayMs = 200, minimumMs = 200) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useLayoutEffect(() => {
    if (visible) shownAt.current = performance.now();
  }, [visible]);
  useEffect(() => {
    if (pending) {
      if (visible) return;
      const timer = window.setTimeout(() => {
        setVisible(true);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, minimumMs - (performance.now() - shownAt.current));
    if (remaining === 0) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [pending, visible, delayMs, minimumMs]);
  return visible;
}
