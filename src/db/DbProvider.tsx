/**
 * React context for the Drizzle/sqlite-wasm database client.
 *
 * `DbProvider` is the only component exported from this file to satisfy the
 * react-refresh constraint. The `useDb` hook lives in `src/hooks/useDb.ts`.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { getDb } from './client';
import { DbContext } from './dbContext';
import type { DbState } from './dbContext';
import { useSettingsStore } from '../store/settings';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface DbProviderProps {
  children: ReactNode;
}

/**
 * Initialises the SQLite database on mount and makes the Drizzle client
 * available to the component tree via `useDb()`.
 *
 * Place this once near the root of the application:
 *
 * ```tsx
 * <DbProvider>
 *   <App />
 * </DbProvider>
 * ```
 */
export function DbProvider({ children }: DbProviderProps) {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [state, setState] = useState<DbState>({
    db: null,
    isReady: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    getDb()
      .then(async (db) => {
        await loadSettings();
        if (!cancelled) {
          setState({ db, isReady: true, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setState({ db: null, isReady: false, error: msg });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  return <DbContext.Provider value={state}>{children}</DbContext.Provider>;
}
