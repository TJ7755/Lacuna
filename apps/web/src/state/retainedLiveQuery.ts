import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';

/** Retain recent workspace snapshots; only mounted readers keep queries live. */
export function retainedLiveQuery<T>(read: (key: string) => Promise<T>) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  function createEntry(key: string) {
    let value: T | undefined;
    let error: { cause: unknown } | undefined;
    let subscription: { unsubscribe(): void } | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    let pending:
      { promise: Promise<void>; resolve(): void; reject(cause: unknown): void } | undefined;
    const listeners = new Set<() => void>();
    function stop() {
      version++;
      subscription?.unsubscribe();
      subscription = undefined;
    }
    function idle() {
      if (listeners.size) return;
      stop();
      error = undefined;
      clearTimeout(expiry);
      expiry = setTimeout(() => entry.dispose(), 5 * 60_000);
    }
    function start() {
      clearTimeout(expiry);
      if (subscription) return;
      const current = ++version;
      subscription = liveQuery(() => read(key)).subscribe({
        next(result) {
          if (current !== version) return;
          value = result;
          error = undefined;
          const waiting = pending;
          pending = undefined;
          listeners.forEach((notify) => notify());
          waiting?.resolve();
          idle();
        },
        error(cause: unknown) {
          if (current !== version) return;
          error = { cause };
          const waiting = pending;
          pending = undefined;
          stop();
          listeners.forEach((notify) => notify());
          waiting?.reject(cause);
          idle();
        },
      });
    }
    const entry = {
      idle: () => listeners.size === 0,
      dispose() {
        clearTimeout(expiry);
        stop();
        pending?.resolve();
        pending = undefined;
        if (entries.get(key) === entry) entries.delete(key);
      },
      snapshot() {
        if (error) throw error.cause;
        return value;
      },
      preload() {
        if (pending) return pending.promise;
        if (subscription && value !== undefined) return Promise.resolve();
        let resolve!: () => void;
        let reject!: (cause: unknown) => void;
        const promise = new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        });
        pending = { promise, resolve, reject };
        start();
        return promise;
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        start();
        return () => {
          listeners.delete(listener);
          if (!pending) idle();
        };
      },
    };
    return entry;
  }
  function getEntry(key: string | undefined) {
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
  }
  function useRetainedQuery(key: string | undefined) {
    const entry = useMemo(() => getEntry(key), [key]);
    return useSyncExternalStore(entry.subscribe, entry.snapshot, entry.snapshot);
  }
  useRetainedQuery.preload = (key: string) => getEntry(key).preload();
  return useRetainedQuery;
}
