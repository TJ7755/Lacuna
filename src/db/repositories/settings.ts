import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { settings } from '../schema';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db
    .insert(settings)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value,
        updated_at: now,
      },
    });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select().from(settings);

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
