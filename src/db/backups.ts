// Automatic local backups: timestamped restore points kept in IndexedDB, plus an
// optional File System Access folder mirror so backups can survive the browser's
// site data being cleared (the one failure IndexedDB restore points cannot).

import { db } from './schema';
import { exportDatabase, importBackup } from './portability';
import type { BackupFile, BackupSnapshot } from './types';
import { scheduleAssetGc } from './assets';
import { replacementLifecycle } from './replacementLifecycle';
import { mirrorToFolder } from './backupFolder';

export {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  folderMirrorSupported,
  mirrorToFolder,
} from './backupFolder';

const MAX_RESTORE_POINTS = 10;
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

let lastBackupAt = 0;
const MIN_BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Reset the backup throttle so tests can call `takeAutoBackup` repeatedly. */
export function __resetBackupThrottleForTests(): void {
  lastBackupAt = 0;
}

/** Capture a full snapshot as a restore point, prune to the cap, and mirror if configured.
 *  Calls within the 5-minute throttle window are silently skipped so rapid mutations
 *  do not produce N backups per session. Pass `force: true` to bypass the throttle.
 *  Returns the snapshot that was stored, or `undefined` when the throttle skipped. */
export async function takeAutoBackup(force = false): Promise<BackupFile | undefined> {
  if (!force && Date.now() - lastBackupAt < MIN_BACKUP_INTERVAL) return;
  lastBackupAt = Date.now();

  const payload = await exportDatabase();
  const snapshot: BackupSnapshot = {
    createdAt: payload.exportedAt,
    deckCount: payload.lessons?.length ?? 0,
    cardCount: payload.cards.length,
    payload,
  };
  await db.backups.add(snapshot);

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

/** Take a backup only if the newest restore point is older than 24 hours. */
export async function autoBackupIfStale(): Promise<void> {
  const last = await db.backups.orderBy('createdAt').last();
  if (last && Date.now() - last.createdAt < STALE_MS) return;
  await takeAutoBackup();
  // Sweep orphaned assets once per day alongside the backup.
  scheduleAssetGc();
}

/** Replace the whole database from a stored restore point. */
export async function restoreBackup(id: number): Promise<void> {
  const snapshot = await db.backups.get(id);
  if (!snapshot) throw new Error('That restore point could not be found.');
  await replacementLifecycle.replace('manual', () => importBackup(snapshot.payload, 'replace'));
}

/** Remove a stored restore point. */
export async function deleteBackup(id: number): Promise<void> {
  await db.backups.delete(id);
}
