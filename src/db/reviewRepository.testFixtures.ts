import 'fake-indexeddb/auto';
import { db } from './schema';
import type { SessionHistoryEntry } from './types';

export async function waitForTrajectorySample(
  eventId: string,
): Promise<SessionHistoryEntry & { id: number }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entry = await db.sessionHistory.where('eventId').equals(eventId).first();
    if (entry?.id !== undefined) return entry as SessionHistoryEntry & { id: number };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for trajectory sample ${eventId}.`);
}
