import { db } from './schema';
import { replacementLifecycle } from './replacementLifecycle';

/** Drain application writes before clearing every table in one transaction. */
export async function resetTestDatabase(): Promise<void> {
  await replacementLifecycle.replace('manual', async () => {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()));
    });
  });
}
