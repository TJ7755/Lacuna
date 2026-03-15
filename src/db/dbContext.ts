/**
 * Database context definition.
 *
 * Kept separate from DbProvider.tsx so the provider file exports only a
 * React component, satisfying the react-refresh fast-reload constraint.
 */

import { createContext } from 'react';
import type { DrizzleClient } from './client';

export interface DbState {
  db: DrizzleClient | null;
  isReady: boolean;
  error: string | null;
}

export const DbContext = createContext<DbState | null>(null);
