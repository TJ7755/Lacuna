import { startOfDay } from '../utils/datetime';
import { db } from './schema';
import type { SessionHistoryEntry } from './types';

function keepLater(
  rows: Map<string, SessionHistoryEntry>,
  key: string,
  candidate: SessionHistoryEntry,
): void {
  const current = rows.get(key);
  if (!current || candidate.timestamp >= current.timestamp) rows.set(key, candidate);
}

/**
 * Return the exact daily projection consumed by the global trajectory chart.
 * IndexedDB is traversed with a cursor, so repeated within-day samples do not
 * all materialise in JavaScript merely to be discarded by chart preparation.
 */
export async function listGlobalDailySessionHistory(): Promise<SessionHistoryEntry[]> {
  const rows = new Map<string, SessionHistoryEntry>();
  await db.sessionHistory.orderBy('timestamp').each((entry) => {
    if (!entry.courseId) return;
    keepLater(rows, `${entry.courseId}\u0000${startOfDay(entry.timestamp)}`, entry);
  });
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** Return the exact one-point-per-day projection consumed by Course analytics. */
export async function listCourseDailySessionHistory(
  courseId: string,
): Promise<SessionHistoryEntry[]> {
  const rows = new Map<string, SessionHistoryEntry>();
  await db.sessionHistory
    .where('courseId')
    .equals(courseId)
    .each((entry) => keepLater(rows, String(startOfDay(entry.timestamp)), entry));
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
}
