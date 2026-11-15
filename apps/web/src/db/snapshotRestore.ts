import type { Transaction } from 'dexie';
import type { Tombstone } from '@lacuna/core/db/types';
import { stampUpdatedAt, type SnapshotTable } from './mutationStamp';

/** Undo is a new write: even a rolled-back clock must beat the deletion received by peers. */
export async function stampRestoredRecords<T extends { updatedAt: number }>(
  tx: Transaction,
  table: SnapshotTable,
  records: readonly T[],
  identity: (record: T) => string,
): Promise<T[]> {
  const deletions: (Tombstone | undefined)[] = await tx
    .table('tombstones')
    .bulkGet(records.map((record) => [table, identity(record)]));
  return records.map((record, index) =>
    stampUpdatedAt(
      record,
      Math.max(Date.now(), record.updatedAt + 1, (deletions[index]?.deletedAt ?? 0) + 1),
    ),
  );
}

export async function assertRestoreOwner(
  tx: Transaction,
  courseId: string,
  lessonId: string | null,
): Promise<void> {
  if (!(await tx.table('courses').get(courseId)))
    throw new Error('Cannot undo: the course no longer exists.');
  if (lessonId) {
    const lesson = await tx.table('lessons').get(lessonId);
    if (!lesson || lesson.courseId !== courseId)
      throw new Error('Cannot undo: the lesson no longer exists in this course.');
  }
}
