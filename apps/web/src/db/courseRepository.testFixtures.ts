import { resetTestDatabase } from './database.testFixtures';
import 'fake-indexeddb/auto';
import { expect, vi } from 'vitest';
import { db } from './schema';

export async function reset() {
  await resetTestDatabase();
}

export async function waitForSessionHistory(eventId: string): Promise<void> {
  await vi.waitFor(async () => {
    expect(await db.sessionHistory.where('eventId').equals(eventId).count()).toBeGreaterThan(0);
  });
}
