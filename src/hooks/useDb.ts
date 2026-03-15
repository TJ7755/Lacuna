/**
 * useDb — consumes the database context.
 *
 * Throws if called outside `<DbProvider>`. Kept in a separate file from
 * `DbProvider.tsx` so the provider component file has a single export,
 * satisfying the react-refresh fast-reload constraint.
 */

import { useContext } from 'react';
import { DbContext } from '../db/dbContext';
import type { DbState } from '../db/dbContext';

/**
 * Returns the current database state: `{ db, isReady, error }`.
 *
 * Check `isReady` before using `db`:
 *
 * ```tsx
 * const { db, isReady, error } = useDb();
 * if (!isReady) return <p>{UI.common.loading}</p>;
 * ```
 */
export function useDb(): DbState {
  const ctx = useContext(DbContext);
  if (!ctx) {
    throw new Error('[lacuna] useDb() must be called inside <DbProvider>.');
  }
  return ctx;
}
