// Automatic local backups: timestamped restore points kept in IndexedDB, plus an
// optional File System Access folder mirror so backups can survive the browser's
// site data being cleared (the one failure IndexedDB restore points cannot).

import { db } from './schema';
import type { BackupFile } from './types';
import { scheduleAssetGc } from './assets';
import { replacementLifecycle } from './replacementLifecycle';
import { backupIsStale, createRestorePoint } from './backupRestorePoint';
import { runDailyBackupWorker } from './dailyBackupWorker';

export {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  folderMirrorSupported,
  mirrorToFolder,
} from './backupFolder';

let lastSuccessfulBackupAt: number | null = null;
const pendingBackups = new Set<{ at: number }>();
const MIN_BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Reset the backup throttle so tests can call `takeAutoBackup` repeatedly. */
export function __resetBackupThrottleForTests(): void {
  lastSuccessfulBackupAt = null;
  pendingBackups.clear();
}

function reserveBackup(force: boolean): { at: number } | undefined {
  const now = Date.now();
  if (!force) {
    if (lastSuccessfulBackupAt !== null && now - lastSuccessfulBackupAt < MIN_BACKUP_INTERVAL)
      return;
    for (const pending of pendingBackups) {
      if (now - pending.at < MIN_BACKUP_INTERVAL) return;
    }
  }
  const reservation = { at: now };
  pendingBackups.add(reservation);
  return reservation;
}

function markStored(reservation: { at: number }): void {
  // An older in-flight success must not replace the time of a newer success.
  lastSuccessfulBackupAt = Math.max(lastSuccessfulBackupAt ?? -Infinity, reservation.at);
  pendingBackups.delete(reservation);
}

/** Capture a full snapshot as a restore point, prune to the cap, and mirror if configured.
 *  Calls within the 5-minute throttle window are silently skipped so rapid mutations
 *  do not produce N backups per session. Pass `force: true` to bypass the throttle.
 *  Returns the snapshot that was stored, or `undefined` when the throttle skipped. */
export async function takeAutoBackup(force = false): Promise<BackupFile | undefined> {
  const reservation = reserveBackup(force);
  if (!reservation) return;
  try {
    return await createRestorePoint(() => markStored(reservation));
  } finally {
    pendingBackups.delete(reservation);
  }
}

/** Take a daily restore point away from the UI thread, retaining the interactive fallback. */
export async function autoBackupIfStale(): Promise<void> {
  if (typeof Worker === 'undefined') {
    if (!(await backupIsStale())) return;
    await takeAutoBackup();
    scheduleAssetGc();
    return;
  }
  const reservation = reserveBackup(false);
  if (!reservation) return;
  try {
    const stored = await runDailyBackupWorker(() => markStored(reservation));
    if (stored) scheduleAssetGc();
  } finally {
    pendingBackups.delete(reservation);
  }
}

/** Replace the whole database from a stored restore point. */
export async function restoreBackup(id: number): Promise<void> {
  const snapshot = await db.backups.get(id);
  if (!snapshot) throw new Error('That restore point could not be found.');
  await replacementLifecycle.replace('manual', async () => {
    const { importBackup } = await import('./portability');
    return importBackup(snapshot.payload, 'replace');
  });
}

/** Remove a stored restore point. */
export async function deleteBackup(id: number): Promise<void> {
  await db.backups.delete(id);
}
