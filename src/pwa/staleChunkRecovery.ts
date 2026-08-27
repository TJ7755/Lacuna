const RECOVERY_ATTEMPT_KEY = 'lacuna-stale-chunk-recovery-at';
const RECOVERY_COOLDOWN_MS = 60_000;

export interface StaleChunkRecoveryEnvironment {
  events: EventTarget;
  storage: Storage;
  clearPwaState(): Promise<void>;
  reload(): void;
  now(): number;
}

/**
 * Vite reports a missing deployment chunk before React sees the rejected import.
 * Recover once by dropping the stale service worker/cache state; a second failure
 * within the cooldown is allowed through to the normal diagnostic boundary.
 */
export function installStaleChunkRecovery(
  environment: StaleChunkRecoveryEnvironment = browserEnvironment(),
): () => void {
  const onPreloadError = (event: Event) => {
    if (!claimRecoveryAttempt(environment.storage, environment.now())) return;
    event.preventDefault();
    void environment.clearPwaState().finally(() => environment.reload());
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
