import { backupIsStale, createRestorePoint } from '../db/backupRestorePoint';
import { db } from '../db/schema';
import type { DailyBackupResponse } from '../db/dailyBackupWorker';

const ctx = globalThis as unknown as {
  postMessage(message: DailyBackupResponse): void;
  onmessage: (() => void) | null;
};

ctx.onmessage = () => {
  ctx.onmessage = null;
  void (async () => {
    try {
      const stale = await backupIsStale();
      if (stale) await createRestorePoint(() => ctx.postMessage({ type: 'stored' }));
      ctx.postMessage({ type: 'done', stored: stale });
    } catch (error) {
      ctx.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      db.close();
    }
  })();
};
