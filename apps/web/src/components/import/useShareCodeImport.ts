import { useState } from 'react';
import { importLineageFirstTime, isLineagePayload, mergeLineageUpdate } from '../../db/mergeImport';
import { decodeShare, importSharePayload } from '../../db/share';
import { findCourseForLineage, type MergeLineageResult } from '../../db/mergeImport';
import { summariseShare, type SharePayload, type ShareSummary } from '../../db/share';
import type { CourseRecord } from '../../db/types';

/** A decoded, not-yet-confirmed share-code import. `merge` is present when the
 *  payload's lineage matches a course already imported locally — routing the confirm
 *  step to the merge importer instead of a plain new-course import. */
export interface PendingShareImport {
  summary: ShareSummary;
  raw: string;
  merge?: {
    course: CourseRecord;
    incomingRevision: number;
    /** True when `incomingRevision` is not newer than the local copy — nothing to merge. */
    stale: boolean;
  };
}

/** Does this payload's lineage match a course already tracked locally? If so, route
 *  the confirm step to the merge importer instead of the plain `importSharePayload`
 *  path. */
async function resolvePending(payload: SharePayload, raw: string): Promise<PendingShareImport> {
  const summary = summariseShare(payload);
  if (isLineagePayload(payload)) {
    const course = await findCourseForLineage(payload.li);
    if (course) {
      const localRevision = course.distributedCopy?.revision ?? 0;
      return {
        summary,
        raw,
        merge: { course, incomingRevision: payload.rv, stale: payload.rv <= localRevision },
      };
    }
  }
  return { summary, raw };
}

/** Turn a merge result into a single sentence for the confirm surface. */
function describeMergeResult(result: MergeLineageResult): string {
  const parts: string[] = [];
  if (result.createdLessons || result.createdNotes || result.createdCards) {
    parts.push(
      `added ${result.createdLessons} lesson${result.createdLessons === 1 ? '' : 's'}, ` +
        `${result.createdNotes} note${result.createdNotes === 1 ? '' : 's'} and ` +
        `${result.createdCards} card${result.createdCards === 1 ? '' : 's'}`,
    );
  }
  if (result.appliedUpdates || result.appliedRemovals) {
    parts.push(
      `applied ${result.appliedUpdates} update${result.appliedUpdates === 1 ? '' : 's'} and ` +
        `${result.appliedRemovals} removal${result.appliedRemovals === 1 ? '' : 's'}`,
    );
  }
  let message =
    parts.length > 0
      ? `Updated the course — ${parts.join('; ')}.`
      : 'The course is already up to date.';
  if (result.queuedForReview) {
    message +=
      result.conflictCount > 0
        ? ` ${result.conflictCount} change${result.conflictCount === 1 ? '' : 's'} ${result.conflictCount === 1 ? 'is' : 'are'} waiting for your review.`
        : ' Some changes are waiting for your review.';
  }
  return message;
}

export function useShareCodeImport(
  text: string,
  setText: (value: string) => void,
  onShareImport?: (courses: number, cards: number, courseIds: string[]) => void | Promise<void>,
) {
  const [sharePending, setSharePending] = useState<PendingShareImport | null>(null);
  const [shareImporting, setShareImporting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  /** Outcome sentence for a completed merge (Arc 7 §7.5) — a merge updates an existing
   *  course rather than adding a new one, so it is shown here instead of via
   *  `onShareImport`'s new-import notification path. */
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  async function handleShareInspect() {
    const raw = text.trim();
    if (!raw) return;
    setShareError(null);
    try {
      const payload = await decodeShare(raw);
      setSharePending(await resolvePending(payload, raw));
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Invalid share code.');
    }
  }

  async function handleShareImport() {
    if (!sharePending || sharePending.merge?.stale) return;
    setShareImporting(true);
    setShareError(null);
    setShareNotice(null);
    try {
      const payload = await decodeShare(sharePending.raw);
      if (sharePending.merge) {
        const result = await mergeLineageUpdate(sharePending.merge.course.id, payload);
        setSharePending(null);
        setText('');
        // A merge updates an existing course rather than creating one, so it does not
        // fit onShareImport's (courses, cards) "new import" contract — show the
        // outcome inline instead.
        setShareNotice(describeMergeResult(result));
      } else if (isLineagePayload(payload)) {
        const { course } = await importLineageFirstTime(payload);
        setSharePending(null);
        setShareError(null);
        setText('');
        if (onShareImport) {
          await onShareImport(1, sharePending.summary.cardCount, [course.id]);
        }
      } else {
        const result = await importSharePayload(payload);
        setSharePending(null);
        setShareError(null);
        setText('');
        if (onShareImport) {
          await onShareImport(result.courses, result.cards, result.courseIds);
        }
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setShareImporting(false);
    }
  }

  function clearSharePending() {
    setText('');
    setSharePending(null);
    setShareError(null);
    setShareNotice(null);
  }

  return {
    setSharePending,
    setShareError,
    setShareNotice,
    sharePending,
    shareImporting,
    shareError,
    shareNotice,
    handleShareInspect,
    handleShareImport,
    clearSharePending,
  };
}
