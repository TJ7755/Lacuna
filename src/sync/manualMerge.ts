// Manual two-device merge. Given a parsed remote BackupFile, take a forced
// local restore point, merge that same snapshot with the remote file, then
// replace the database with the result. P5 will reuse this seam; keep it free
// of React.

import { takeAutoBackup } from '../db/backups';
import { importBackup, validateBackup } from '../db/portability';
import type { BackupFile } from '../db/types';
import { mergeSnapshots } from './mergeSnapshots';

export interface MergeCounts {
  cards: number;
  courses: number;
  lessons: number;
  reviewEvents: number;
}

export interface ManualMergeSummary {
  before: MergeCounts;
  after: MergeCounts;
}

export class ManualMergeError extends Error {
  readonly databaseModified: boolean;

  constructor(message: string, options: { databaseModified: boolean }) {
    super(message);
    this.name = 'ManualMergeError';
    this.databaseModified = options.databaseModified;
  }
}

/** Combine the current local database with a backup exported from another device. */
export async function manualMerge(remote: BackupFile): Promise<ManualMergeSummary> {
  if (!validateBackup(remote)) {
    throw new ManualMergeError('This file is not a valid Lacuna backup.', {
      databaseModified: false,
    });
  }

  let local: BackupFile;
  try {
    const snapshot = await takeAutoBackup(true);
    if (!snapshot) {
      throw new ManualMergeError(
        'A safety backup could not be taken, so the database was not modified.',
        { databaseModified: false },
      );
    }
    local = snapshot;
  } catch (error) {
    if (error instanceof ManualMergeError) throw error;
    throw new ManualMergeError(
      `${messageOf(error)} A safety backup could not be taken, so the database was not modified.`,
      { databaseModified: false },
    );
  }

  let merged: BackupFile;
  try {
    merged = mergeSnapshots(local, remote);
  } catch (error) {
    throw new ManualMergeError(
      `${messageOf(error)} The database was not modified.`,
      { databaseModified: false },
    );
  }

  try {
    await importBackup(merged, 'replace');
  } catch (error) {
    throw new ManualMergeError(messageOf(error), { databaseModified: true });
  }

  return { before: countsOf(local), after: countsOf(merged) };
}

function countsOf(snapshot: BackupFile): MergeCounts {
  return {
    cards: snapshot.cards.length,
    courses: snapshot.courses?.length ?? 0,
    lessons: snapshot.lessons?.length ?? 0,
    reviewEvents: snapshot.reviewHistory?.length ?? 0,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
