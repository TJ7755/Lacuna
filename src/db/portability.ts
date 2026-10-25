// Import/Export: the entire database serialises to a single JSON file and back.

import { db } from './schema';
import type { BackupFile } from './types';
import { assertValidBackup, backupIsValid } from './backupValidation';
import { prepareBackup, type ImportMode } from './backupPreparation';
import { replaceBackup } from './backupReplacement';
import { mergeBackupForRecovery } from './backupRecovery';
export type { ImportMode } from './backupPreparation';

import { exportDatabase } from './backupSnapshot';
export { BACKUP_VERSION, exportDatabase } from './backupSnapshot';
export const MAX_BACKUP_FILE_BYTES = 200 * 1024 * 1024;

/** Trigger a browser download of the backup as a timestamped JSON file. */
export async function downloadBackup(): Promise<void> {
  const data = await exportDatabase();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lacuna-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Validate that an unknown parsed object is a Lacuna backup file. */
export function validateBackup(data: unknown): data is BackupFile {
  return backupIsValid(data);
}

export const PRE_V22_BACKUP_MESSAGE =
  'This backup predates schema v22 and can no longer be imported.';

/** True when the file still carries Deck or Folder rows from before schema v22. */
export function isPreV22Backup(backup: BackupFile): boolean {
  return (backup.decks?.length ?? 0) > 0 || (backup.folders?.length ?? 0) > 0;
}

function assertCurrentBackup(backup: BackupFile): void {
  if (isPreV22Backup(backup)) {
    throw new Error(PRE_V22_BACKUP_MESSAGE);
  }
}

/**
 * Import a backup. In "replace" mode the database is cleared first; in "merge" mode
 * records are matched by id and the most recently touched copy wins each conflict.
 * SessionHistory is append-only and de-duplicated by stable event identity when
 * available, falling back to (timestamp, deckId) for legacy rows.
 */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  assertValidBackup(backup);
  assertCurrentBackup(backup);
  const prepared = await prepareBackup(backup, mode);
  await db.transaction(
    'rw',
    [
      db.cards,
      db.sessionHistory,
      db.userPerformance,
      db.assets,
      db.courses,
      db.lessons,
      db.notes,
      db.noteAnnotations,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.practiceNodes,
      db.practiceMilestones,
      db.courseAssessments,
      db.sequences,
      db.occlusions,
      db.revisionPlans,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.tombstones,
      db.concepts,
      db.questions,
      db.questionConcepts,
      db.questionAttempts,
      db.questionSets,
      db.questionSetAttempts,
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
    ],
    async () => {
      if (mode === 'replace') {
        await replaceBackup(prepared);
      } else {
        await mergeBackupForRecovery(prepared);
      }
    },
  );
}

/** Read and parse a user-selected JSON backup file. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Backup file exceeds the 200 MB limit.');
  }
  const text = await file.text();
  const data = JSON.parse(text);
  assertValidBackup(data, 'This file is not a valid Lacuna backup.');
  assertCurrentBackup(data);
  return data;
}
