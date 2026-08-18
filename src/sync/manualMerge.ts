// Manual two-device merge. Given a parsed remote BackupFile, take a forced
// local restore point, merge that same snapshot with the remote file, then
// replace the database with the result. P5 will reuse this seam; keep it free
// of React.

import { takeAutoBackup } from '../db/backups';
import { importBackup, validateBackup } from '../db/portability';
import type { BackupFile } from '../db/types';
import { mergeSnapshots } from './mergeSnapshots';

export interface MergeDelta {
  kept: number;
  added: number;
  removed: number;
}

export interface ManualMergeSummary {
  cards: MergeDelta;
  courses: MergeDelta;
  lessons: MergeDelta;
  reviewEvents: MergeDelta;
}

export class ManualMergeError extends Error {
  readonly databaseModified: boolean;
  readonly causeError?: unknown;

  constructor(message: string, options: { databaseModified: boolean; causeError?: unknown }) {
    super(message);
    this.name = 'ManualMergeError';
    this.databaseModified = options.databaseModified;
    this.causeError = options.causeError;
  }
}

export interface ManualMergeOptions {
  /** Run after merging but before replace-import, while the database is untouched. */
  beforeApply?: (merged: BackupFile) => void | Promise<void>;
}

/** Combine the current local database with a backup exported from another device. */
export async function manualMerge(
  remote: BackupFile,
  options: ManualMergeOptions = {},
): Promise<ManualMergeSummary> {
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
    throw new ManualMergeError(`${messageOf(error)} The database was not modified.`, {
      databaseModified: false,
    });
  }

  try {
    await options.beforeApply?.(merged);
  } catch (error) {
    throw new ManualMergeError(messageOf(error), { databaseModified: false, causeError: error });
  }

  try {
    await importBackup(merged, 'replace');
  } catch (error) {
    throw new ManualMergeError(messageOf(error), { databaseModified: true, causeError: error });
  }

  return summariseMerge(local, merged);
}

/** Compare a local snapshot with the merge result by record id. */
export function summariseMerge(local: BackupFile, merged: BackupFile): ManualMergeSummary {
  return {
    cards: deltaOf(local.cards, merged.cards),
    courses: deltaOf(local.courses, merged.courses),
    lessons: deltaOf(local.lessons, merged.lessons),
    reviewEvents: deltaOf(local.reviewHistory, merged.reviewHistory),
  };
}

function deltaOf(
  before: Array<{ id: string }> | undefined,
  after: Array<{ id: string }> | undefined,
): MergeDelta {
  const beforeIds = new Set((before ?? []).map((row) => row.id));
  const afterIds = new Set((after ?? []).map((row) => row.id));
  let kept = 0;
  let added = 0;
  let removed = 0;
  for (const id of afterIds) {
    if (beforeIds.has(id)) kept += 1;
    else added += 1;
  }
  for (const id of beforeIds) {
    if (!afterIds.has(id)) removed += 1;
  }
  return { kept, added, removed };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
