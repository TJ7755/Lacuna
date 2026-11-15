import { resetTestDatabase } from './database.testFixtures';
import { db } from './schema';
import type { BackupFile } from '@lacuna/core/db/types';

export async function reset() {
  await resetTestDatabase();
}

export async function waitForSessionHistory(eventId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await db.sessionHistory.where('eventId').equals(eventId).count()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for session history ${eventId}.`);
}

export function preV22Backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 9,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  };
}
