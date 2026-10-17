import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';

/** Keep a few recently visited workspaces live, including while a study session is open. */
export function retainedLiveQuery<T>(read: (key: string) => Promise<T>) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  function createEntry(key: string) {
    let value: T | undefined;
    let error: unknown;
    let subscription: { unsubscribe(): void } | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const listeners = new Set<() => void>();
    const entry = {
      idle: () => listeners.size === 0,
      dispose() {
        clearTimeout(expiry);
        subscription?.unsubscribe();
        entries.delete(key);
      },
      snapshot() {
        if (error) throw error;
        return value;
      },
      subscribe(listener: () => void) {
        clearTimeout(expiry);
        listeners.add(listener);
        if (!subscription) {
          subscription = liveQuery(() => read(key)).subscribe({
            next(result) {
              value = result;
              listeners.forEach((notify) => notify());
            },
            error(cause: unknown) {
              error = cause;
              listeners.forEach((notify) => notify());
            },
          });
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) expiry = setTimeout(() => entry.dispose(), 5 * 60_000);
        };
      },
    };
    return entry;
  }
  return function useRetainedQuery(key: string | undefined) {
    const entry = useMemo(() => {
      const id = key ?? '';
      let cached = entries.get(id);
      if (!cached) {
        // Active readers are never evicted. Idle snapshots expire even if no new course opens.
        for (const candidate of entries.values()) {
          if (entries.size < 5) break;
          if (candidate.idle()) candidate.dispose();
        }
        cached = createEntry(id);
        entries.set(id, cached);
      }
      return cached;
    }, [key]);
    return useSyncExternalStore(entry.subscribe, entry.snapshot, entry.snapshot);
  };
}
