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

/**
 * Startup maintenance must not race the first search/navigation for IndexedDB.
 * Give input five quiet seconds, but run within thirty seconds of readiness so
 * continuous interaction cannot indefinitely postpone the daily restore point.
 */
export function scheduleBackgroundWork(work: () => void): () => void {
  const events = ['keydown', 'pointerdown', 'wheel'] as const;
  let finished = false;
  let quiet: ReturnType<typeof setTimeout>;
  const stop = () => {
    clearTimeout(quiet);
    clearTimeout(deadline);
    for (const event of events) window.removeEventListener(event, postpone);
  };
  const run = () => {
    if (finished) return;
    finished = true;
    stop();
    work();
  };
  const postpone = () => {
    clearTimeout(quiet);
    quiet = setTimeout(run, 5_000);
  };
  const deadline = setTimeout(run, 30_000);
  for (const event of events) window.addEventListener(event, postpone, { passive: true });
  postpone();
  return () => {
    finished = true;
    stop();
  };
}
