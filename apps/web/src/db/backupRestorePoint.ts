// Snapshot contents and storage are shared by interactive and worker backups.
import { db } from './schema';
import { exportDatabase } from './backupSnapshot';
import { mirrorToFolder } from './backupFolder';
import type { BackupFile, BackupSnapshot } from '@lacuna/core/db/types';

const MAX_RESTORE_POINTS = 10;
const STALE_MS = 24 * 60 * 60 * 1000;

export async function backupIsStale(): Promise<boolean> {
  const last = await db.backups.orderBy('createdAt').last();
  return !last || Date.now() - last.createdAt >= STALE_MS;
}

export async function createRestorePoint(onStored: () => void): Promise<BackupFile> {
  const payload = await exportDatabase();
  const snapshot: BackupSnapshot = {
    createdAt: payload.exportedAt,
    deckCount: payload.lessons?.length ?? 0,
    cardCount: payload.cards.length,
    payload,
  };
  await db.backups.add(snapshot);
  onStored();
  // Keep only the most recent restore points. Pre-migration snapshots are exempt:
  // they are the safety net for a botched upgrade and must not be pruned away.
  const all = await db.backups.orderBy('createdAt').toArray();
  const prunable = all.filter((s) => (s.tag ?? '') !== 'pre-migration');
  if (prunable.length > MAX_RESTORE_POINTS) {
    const excess = prunable.slice(0, prunable.length - MAX_RESTORE_POINTS);
    await db.backups.bulkDelete(excess.map((s) => s.id!));
  }

  // Best-effort folder mirror; never let it break the backup itself.
  await mirrorToFolder(payload).catch((e: unknown) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('Folder mirror failed:', e);
    }
  });

  return payload;
}
