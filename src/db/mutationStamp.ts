// Single write-stamp and tombstone helpers for schema v23.
// Every content mutation must go through these rather than calling Date.now()
// at the call site. recordTombstone / clearTombstone must run inside the
// caller's existing Dexie transaction — opening a second transaction here
// could commit a tombstone whose delete later rolls back.

import type { Transaction } from 'dexie';
import { db } from './schema';
import type { SyncState, Tombstone } from './types';

export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const SYNC_STATE_KEY = 'syncState';

export type SnapshotTable =
  | 'cards'
  | 'courses'
  | 'lessons'
  | 'notes'
  | 'lessonCards'
  | 'lessonCardExposures'
  | 'lessonCompletions'
  | 'practiceNodes'
  | 'practiceMilestones'
  | 'courseAssessments'
  | 'sequences'
  | 'revisionPlans'
  | 'occlusions'
  | 'schedulingUnits'
  | 'coursePerformance'
  | 'schedulingPerformance';

/** Compound LessonCardExposure key as a single tombstone record id. */
export function lessonCardExposureId(lessonId: string, cardId: string): string {
  return `${lessonId}:${cardId}`;
}

export function stampUpdatedAt<T extends object>(
  record: T,
  now = Date.now(),
): T & { updatedAt: number } {
  return { ...record, updatedAt: now };
}

export async function recordTombstone(
  tx: Transaction,
  table: SnapshotTable,
  recordId: string,
  deletedAt = Date.now(),
): Promise<void> {
  const row: Tombstone = { table, recordId, deletedAt };
  await tx.table('tombstones').put(row);
}

export async function recordTombstones(
  tx: Transaction,
  table: SnapshotTable,
  recordIds: readonly string[],
  deletedAt = Date.now(),
): Promise<void> {
  if (recordIds.length === 0) return;
  const rows: Tombstone[] = recordIds.map((recordId) => ({ table, recordId, deletedAt }));
  await tx.table('tombstones').bulkPut(rows);
}

export async function clearTombstone(
  tx: Transaction,
  table: SnapshotTable,
  recordId: string,
): Promise<void> {
  await tx.table('tombstones').delete([table, recordId]);
}

export async function clearTombstones(
  tx: Transaction,
  table: SnapshotTable,
  recordIds: readonly string[],
): Promise<void> {
  if (recordIds.length === 0) return;
  await tx.table('tombstones').bulkDelete(recordIds.map((recordId) => [table, recordId]));
}

export async function readSyncState(): Promise<SyncState | undefined> {
  const entry = await db.appState.get(SYNC_STATE_KEY);
  if (!entry || entry.value === null || entry.value === undefined || typeof entry.value !== 'object') {
    return undefined;
  }
  return entry.value as SyncState;
}

export async function writeSyncState(state: SyncState): Promise<void> {
  await db.appState.put({ key: SYNC_STATE_KEY, value: state });
}
