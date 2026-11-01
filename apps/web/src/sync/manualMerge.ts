// Combine a remote backup with local state, keeping a forced restore point
// before replacement. Peer sync alone can skip a proven unchanged application.

import { takeAutoBackup } from '../db/backups';
import { adaptLegacyBackup } from '../db/legacyBackupAdapter';
import { migrateCardRecord } from '../db/migrations';
import { BACKUP_VERSION, exportDatabase, importBackup, validateBackup } from '../db/portability';
import type { BackupFile } from '../db/types';
import { mergeSnapshots, snapshotStateUnchanged } from './mergeSnapshots';
import { normaliseQuestionBackup } from '../questions/backup';
import { replacementLifecycle, type ReplacementKind } from '../db/replacementLifecycle';

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
  concepts: MergeDelta;
  questions: MergeDelta;
  questionConcepts: MergeDelta;
  questionAttempts: MergeDelta;
  questionSets: MergeDelta;
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
  /** Run after merging, including a proven no-op, while the database is untouched. */
  beforeApply?: (merged: BackupFile) => void | Promise<void>;
  /** Manual device combination is recovery; automatic encrypted sync is peer application. */
  kind?: Exclude<ReplacementKind, 'manual'>;
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

  return replacementLifecycle.replace(options.kind ?? 'recovery', () =>
    executeManualMerge(remote, options),
  );
}

async function executeManualMerge(
  remote: BackupFile,
  options: ManualMergeOptions,
): Promise<ManualMergeSummary> {
  const unchanged = options.kind === 'peer' ? await unchangedPeerSnapshot(remote) : undefined;
  let local: BackupFile;
  let merged: BackupFile;
  if (unchanged) {
    local = unchanged;
    merged = unchanged;
  } else {
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

    try {
      merged = mergeSnapshots(local, remote);
    } catch (error) {
      throw new ManualMergeError(`${messageOf(error)} The database was not modified.`, {
        databaseModified: false,
      });
    }
  }

  try {
    await options.beforeApply?.(merged);
  } catch (error) {
    throw new ManualMergeError(messageOf(error), { databaseModified: false, causeError: error });
  }

  if (!unchanged) {
    try {
      await importBackup(merged, 'replace');
    } catch (error) {
      throw new ManualMergeError(messageOf(error), { databaseModified: true, causeError: error });
    }
  }

  return summariseMerge(local, merged);
}

/** Called inside the peer replacement fence, before any backup or import writes. */
async function unchangedPeerSnapshot(remote: BackupFile): Promise<BackupFile | undefined> {
  if (
    remote.version !== BACKUP_VERSION ||
    remote.app !== `lacuna-v${BACKUP_VERSION}` ||
    (remote.tombstones?.length ?? 0) > 0
  )
    return;

  try {
    const local = await exportDatabase();
    if (
      local.version !== BACKUP_VERSION ||
      local.app !== remote.app ||
      (local.tombstones?.length ?? 0) > 0 ||
      !validateBackup(local) ||
      !snapshotStateUnchanged(local, remote) ||
      needsImportMigration(local)
    )
      return;

    const merged = mergeSnapshots(local, remote);
    if (snapshotStateUnchanged(local, merged)) return merged;
  } catch {
    // Uncertainty keeps the normal safety-backup path and its error reporting.
  }
}

function needsImportMigration(snapshot: BackupFile): boolean {
  if (
    snapshot.courses?.some((course) => 'examDate' in course) ||
    snapshot.cards.some((card) => /data:image\//i.test(card.front + card.back)) ||
    snapshot.notes?.some((note) => /data:image\//i.test(note.content))
  )
    return true;

  // Even a current-format payload can still need the importer's legacy card/default backfills.
  const projected = adaptLegacyBackup(snapshot, {
    cards: snapshot.cards.map(migrateCardRecord),
    courses: snapshot.courses ?? [],
    lessons: snapshot.lessons ?? [],
    courseAssessments: snapshot.courseAssessments ?? [],
  });
  return !snapshotStateUnchanged(snapshot, {
    ...snapshot,
    cards: projected.cards,
    schedulingUnits: projected.schedulingUnits,
    coursePerformance: projected.coursePerformance,
    schedulingPerformance: projected.schedulingPerformance,
  });
}

/** Compare a local snapshot with the merge result by record id. */
export function summariseMerge(local: BackupFile, merged: BackupFile): ManualMergeSummary {
  const before = normaliseQuestionBackup(local);
  const after = normaliseQuestionBackup(merged);
  return {
    cards: deltaOf(before.cards, after.cards),
    courses: deltaOf(before.courses, after.courses),
    lessons: deltaOf(before.lessons, after.lessons),
    reviewEvents: deltaOf(before.reviewHistory, after.reviewHistory),
    concepts: deltaOf(before.concepts, after.concepts),
    questions: deltaOf(before.questions, after.questions),
    questionConcepts: deltaBy(
      before.questionConcepts,
      after.questionConcepts,
      (row) => row.questionId,
    ),
    questionAttempts: deltaOf(before.questionAttempts, after.questionAttempts),
    questionSets: deltaOf(before.questionSets, after.questionSets),
  };
}

function deltaBy<T>(
  before: T[] | undefined,
  after: T[] | undefined,
  idOf: (row: T) => string,
): MergeDelta {
  return deltaIds((before ?? []).map(idOf), (after ?? []).map(idOf));
}

function deltaOf(
  before: Array<{ id: string }> | undefined,
  after: Array<{ id: string }> | undefined,
): MergeDelta {
  return deltaIds(
    (before ?? []).map((row) => row.id),
    (after ?? []).map((row) => row.id),
  );
}

function deltaIds(before: readonly string[], after: readonly string[]): MergeDelta {
  const beforeIds = new Set(before);
  const afterIds = new Set(after);
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
