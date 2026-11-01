/** Schedule one speculative load per idle callback, or per fallback timer. */
export function scheduleIdlePrefetch(
  paths: string[],
  prefetch: (path: string) => void,
): () => void {
  let cancelled = false;
  const next = () => {
    if (cancelled || document.visibilityState === 'hidden') return;
    const path = paths.shift();
    if (path) prefetch(path);
    if (paths.length) cancel = schedule();
  };
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(next, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(next, 200);
      return () => window.clearTimeout(id);
    }
  };
  let cancel = schedule();
  return () => {
    cancelled = true;
    cancel();
  };
}
