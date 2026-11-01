import { friendlyDbError } from './dbErrors';
import { recordTombstone, recordTombstones, stampUpdatedAt } from './mutationStamp';
import { db, makeId } from './schema';

/**
 * Publish (or republish) a course for classroom distribution (Arc 7 §7.4).
 * First publish creates `Course.distribution` with a fresh `lineageId` and
 * `revision: 1`; every subsequent call keeps the same `lineageId` and
 * increments `revision` by one. The share-code export path (`src/db/share.ts`)
 * reads `Course.distribution` to decide whether to pack lineage/revision/
 * originating-id fields into the payload — this function only owns the
 * counter, not the encoding.
 */
export async function publishCourse(courseId: string): Promise<{
  lineageId: string;
  revision: number;
  publishedAt: number;
  shareId?: string;
  shareRevision?: number;
}> {
  try {
    let distribution:
      | {
          lineageId: string;
          revision: number;
          publishedAt: number;
          shareId?: string;
          shareRevision?: number;
        }
      | undefined;
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      distribution = {
        lineageId: course.distribution?.lineageId ?? makeId(),
        revision: (course.distribution?.revision ?? 0) + 1,
        publishedAt: Date.now(),
        // A republish keeps the stable share link and its uploaded revision;
        // only an explicit unpublish clears them (see forgetShareCredentials
        // + detach flows). The uploaded revision deliberately trails behind
        // until the link itself is republished.
        ...(course.distribution?.shareId ? { shareId: course.distribution.shareId } : {}),
        ...(course.distribution?.shareRevision !== undefined
          ? { shareRevision: course.distribution.shareRevision }
          : {}),
      };
      await db.courses.update(courseId, stampUpdatedAt({ distribution }));
    });
    return distribution!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Detach a student's imported course from its teacher's lineage (Arc 7 §7.1). A
 * one-way escape hatch from a locked distributed copy: clears `Course.distributedCopy`
 * entirely, which both unlocks the course (absent `distributedCopy` is editable per
 * `canEditLessons`) and severs lineage tracking, so a later re-import of the same share
 * code no longer matches this course and instead falls through to a plain
 * `importCourseSharePayload` — the same "no lineage, treat as new" path a pre-Arc-7
 * course already takes. The lineage's adopted-id membership registry and any pending
 * merge review for this course are removed alongside, since neither can ever be
 * consulted or applied again once the course is detached; the lesson/note/card content
 * itself is untouched.
 */
export async function detachCourse(courseId: string): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.courses, db.lineageIdMappings, db.pendingMergeReviews, db.tombstones],
      async (tx) => {
        const course = await db.courses.get(courseId);
        if (!course) throw new Error('The course could not be found.');
        const lineageId = course.distributedCopy?.lineageId;
        const pendingReviewIds = (
          await db.pendingMergeReviews.where('courseId').equals(courseId).primaryKeys()
        ).map(String);
        await db.courses.update(courseId, stampUpdatedAt({ distributedCopy: undefined }));
        if (lineageId) {
          await db.lineageIdMappings.delete(lineageId);
          // A peer merge must not resurrect the severed lineage registry (see
          // mergeSnapshots' tombstone filter for these tables).
          await recordTombstone(tx, 'lineageIdMappings', lineageId);
        }
        await db.pendingMergeReviews.where('courseId').equals(courseId).delete();
        await recordTombstones(tx, 'pendingMergeReviews', pendingReviewIds);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Sets `distributedCopy.autoAcceptUpdates` on a student's imported course (Arc 7 §7.1,
 * §7.9 Task 8). The value is read by the merge-apply decision in `mergeImport.ts` to
 * decide whether a future teacher update is applied silently or queued for review; this
 * function only persists the preference, it does not affect any pending review.
 */
export async function setCourseAutoAcceptUpdates(
  courseId: string,
  autoAcceptUpdates: boolean,
): Promise<void> {
  try {
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      if (!course.distributedCopy) throw new Error('This course is not a shared copy.');
      await db.courses.update(
        courseId,
        stampUpdatedAt({
          distributedCopy: { ...course.distributedCopy, autoAcceptUpdates },
        }),
      );
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Records the relay share id behind a teacher's `/#/s/<code>` link on the
 * course's distribution state, following the `setCourseAutoAcceptUpdates`
 * pattern. The id is public (it appears in the shared URL); the write token
 * stays device-local in sync state and is never stored here.
 */
export async function setCourseShareId(
  courseId: string,
  shareId: string,
  revision: number,
): Promise<void> {
  try {
    // Read and write inside one transaction: a concurrent publishCourse
    // between a separate read and write would otherwise be overwritten with
    // a stale revision. Same-table read-write transactions serialise in
    // Dexie, and publishCourse already takes one on this table.
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      if (!course.distribution) throw new Error('This course has not been published.');
      if (!/^[0-9a-f]{32}$/.test(shareId)) throw new Error('The share link code is invalid.');
      await db.courses.update(
        courseId,
        stampUpdatedAt({
          distribution: { ...course.distribution, shareId, shareRevision: revision },
        }),
      );
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Clears the relay share id from a teacher's course, e.g. after unpublishing
 * its share link. The lineage counter is untouched: republishing resumes the
 * same revision sequence, while a future link mints a fresh share id.
 */
export async function clearCourseShareId(courseId: string): Promise<void> {
  try {
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      if (!course.distribution?.shareId) return;
      const {
        shareId: _omitted,
        shareRevision: _omittedRevision,
        ...distribution
      } = course.distribution;
      await db.courses.update(courseId, stampUpdatedAt({ distribution }));
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}
