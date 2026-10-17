import { useEffect } from 'react';
import { prefetchRoute } from './prefetch';

/** Hover/focus already prefetches; idle work also covers touch and immediate clicks. */
export function useIdleRoutePrefetch(paths: readonly string[]) {
  const key = paths.join('\n');
  useEffect(() => {
    let cancelled = false;
    const routes = key.split('\n').filter(Boolean);
    const next = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const path = routes.shift();
      if (path) prefetchRoute(path);
      if (routes.length) schedule();
    };
    let cancel: (() => void) | undefined;
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(next, { timeout: 2000 });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(next, 200);
        cancel = () => window.clearTimeout(id);
      }
    };
    schedule();
    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [key]);
}
