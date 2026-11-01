import { formatRelativeTime } from '../../utils/datetime';

/** A restore point older than this reads as stale. Lacuna normally saves one daily. */
export const STALE_BACKUP_MS = 3 * 24 * 60 * 60 * 1000;

export interface BackupStatus {
  label: string;
  tone: 'fresh' | 'stale';
}

/** Plain-language state of the newest restore point, for the Your data hero. */
export function backupStatus(lastAt: number | null, now: number = Date.now()): BackupStatus {
  if (lastAt === null) return { label: 'No backup yet', tone: 'stale' };
  const age = now - lastAt;
  const when = formatRelativeTime(lastAt, now);
  if (age < 60 * 1000) return { label: 'Backed up just now', tone: 'fresh' };
  return age >= STALE_BACKUP_MS
    ? { label: `Last backup ${when}`, tone: 'stale' }
    : { label: `Backed up ${when}`, tone: 'fresh' };
}
