const RECOVERY_ATTEMPT_KEY = 'lacuna-stale-chunk-recovery-at';
const RECOVERY_COOLDOWN_MS = 60_000;

export interface StaleChunkRecoveryEnvironment {
  events: EventTarget;
  storage: Storage;
  clearPwaState(): Promise<void>;
  reload(): void;
  now(): number;
  online(): boolean;
  confirmOnline(): Promise<boolean>;
}

/**
 * Vite reports a missing deployment chunk before React sees the rejected import.
 * Recover at most once by dropping the stale service worker/cache state. Import
 * errors continue to their callers because proving network access is asynchronous.
 */
export function installStaleChunkRecovery(
  environment: StaleChunkRecoveryEnvironment = browserEnvironment(),
): () => void {
  let recoveryPending = false;
  const onPreloadError = () => {
    // An uncached optional chunk can fail during a legitimate offline start.
    // Clearing the worker and its caches there would destroy the shell that is
    // keeping the application usable, then reload into the same absent network.
    if (!environment.online() || recoveryPending) return;
    recoveryPending = true;
    // Confirming connectivity is asynchronous, so the import error must continue
    // to its caller. Preventing it here would make Vite resolve the module as
    // undefined when Chromium briefly reports an offline document as online.
    void environment
      .confirmOnline()
      .then(async (confirmed) => {
        if (!confirmed) return;
        if (!claimRecoveryAttempt(environment.storage, environment.now())) return;
        await environment.clearPwaState().finally(() => environment.reload());
      })
      .catch(() => {})
      .finally(() => {
        recoveryPending = false;
      });
  };

  environment.events.addEventListener('vite:preloadError', onPreloadError);
  return () => environment.events.removeEventListener('vite:preloadError', onPreloadError);
}

function claimRecoveryAttempt(storage: Storage, now: number): boolean {
  try {
    const previous = Number(storage.getItem(RECOVERY_ATTEMPT_KEY));
    if (Number.isFinite(previous) && previous > 0 && now - previous < RECOVERY_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(RECOVERY_ATTEMPT_KEY, String(now));
    return true;
  } catch {
    // Without a durable guard, reloading could trap the page in a loop.
    return false;
  }
}

function browserEnvironment(): StaleChunkRecoveryEnvironment {
  return {
    events: window,
    storage: sessionStorage,
    clearPwaState,
    reload: () => window.location.reload(),
    now: Date.now,
    online: () => navigator.onLine,
    confirmOnline: async () => {
      try {
        const probe = new URL('/sw.js', window.location.origin);
        probe.searchParams.set('online-probe', String(Date.now()));
        return (await fetch(probe, { cache: 'no-store' })).ok;
      } catch {
        return false;
      }
    },
  };
}

async function clearPwaState(): Promise<void> {
  const registrations =
    'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
  const cacheNames = 'caches' in window ? await caches.keys() : [];
  await Promise.all([
    ...registrations.map((registration) => registration.unregister()),
    ...cacheNames.map((cacheName) => caches.delete(cacheName)),
  ]);
}
