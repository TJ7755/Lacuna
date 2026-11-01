import { assertLessonPrerequisites } from './lessonPrerequisites';
import { db } from './schema';
import {
  assignCardsToLesson,
  deleteCards,
  deleteLesson,
  deleteNote,
  updateCard,
  updateNote,
} from './repository';
import type {
  LineageConflict,
  ShareCardInput,
  ShareLessonInput,
  ShareNoteInput,
} from '@lacuna/core/db/lineageDiff';
import { assertLineageReviewIntegrity } from './lineageIntegrity';
import { applyCardUpdate, applyLineageLessonUpdate } from './lineageImportEntities';
import {
  cardSnapshot,
  lessonSnapshot,
  noteSnapshot,
  shareCardKindToType,
  toExistingCard,
  toExistingLesson,
  toExistingNote,
} from './lineageImportModel';
import { MERGE_TABLES } from './lineageImportTables';
import type { LineageIdMapping, PendingMergeReview } from '@lacuna/core/db/types';

// ---------------------------------------------------------------------------
// Review resolution (§7.5's review UI actions, Task 7). A `pendingMergeReviews`
// row holds the still-outstanding updates/removals/conflicts from the last merge;
// these functions apply the student's per-row or bulk decision through the same
// content-only apply paths `mergeLineageUpdate`'s auto-accept branch uses (never a
// second apply implementation), remove the resolved item from the row, delete the
// row once nothing outstanding remains, and refresh the lineage mapping's snapshot
// for every accepted item so the next merge's student-edit detection compares
// against what is now on disk (and does not re-flag an update the student has
// already taken).
// ---------------------------------------------------------------------------

export type MergeReviewItemKind = 'lesson' | 'note' | 'card';

/** Identifies one outstanding item in a pending review. `kind` + `entityId` is unique:
 *  `diffLineage` classifies each entity into exactly one of updates/removals/conflicts. */
export interface MergeReviewItemRef {
  kind: MergeReviewItemKind;
  entityId: string;
}

type PendingDiff = PendingMergeReview['diff'];

function updatesBucket(diff: PendingDiff, kind: MergeReviewItemKind) {
  return kind === 'lesson'
    ? diff.updates.lessons
    : kind === 'note'
      ? diff.updates.notes
      : diff.updates.cards;
}

function removalsBucket(diff: PendingDiff, kind: MergeReviewItemKind): string[] {
  return kind === 'lesson'
    ? diff.removals.lessonIds
    : kind === 'note'
      ? diff.removals.noteIds
      : diff.removals.cardIds;
}

function diffIsEmpty(diff: PendingDiff): boolean {
  return (
    diff.updates.lessons.length === 0 &&
    diff.updates.notes.length === 0 &&
    diff.updates.cards.length === 0 &&
    diff.removals.lessonIds.length === 0 &&
    diff.removals.noteIds.length === 0 &&
    diff.removals.cardIds.length === 0 &&
    diff.conflicts.length === 0
  );
}

/** Every outstanding item in a review as refs. Conflicts are optionally excluded so a
 *  bulk "accept all" leaves student-edited conflicts queued — the manual equivalent of
 *  `autoAcceptUpdates`, which applies updates/removals but never overrides a student edit
 *  (§7.5 step 4). */
function collectRefs(diff: PendingDiff, includeConflicts: boolean): MergeReviewItemRef[] {
  const refs: MergeReviewItemRef[] = [];
  for (const u of diff.updates.lessons) refs.push({ kind: 'lesson', entityId: u.id });
  for (const u of diff.updates.notes) refs.push({ kind: 'note', entityId: u.id });
  for (const u of diff.updates.cards) refs.push({ kind: 'card', entityId: u.id });
  for (const id of diff.removals.lessonIds) refs.push({ kind: 'lesson', entityId: id });
  for (const id of diff.removals.noteIds) refs.push({ kind: 'note', entityId: id });
  for (const id of diff.removals.cardIds) refs.push({ kind: 'card', entityId: id });
  if (includeConflicts) {
    for (const c of diff.conflicts) refs.push({ kind: c.kind, entityId: c.entityId });
  }
  return refs;
}

/** Delete an accepted removal and drop it from the mapping registry + snapshots. */
async function deleteAdoptedEntity(
  kind: MergeReviewItemKind,
  entityId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  if (kind === 'lesson') {
    await deleteLesson(entityId);
    mapping.lessonIds = mapping.lessonIds.filter((x) => x !== entityId);
    delete mapping.lessonSnapshots[entityId];
  } else if (kind === 'note') {
    await deleteNote(entityId);
    mapping.noteIds = mapping.noteIds.filter((x) => x !== entityId);
    delete mapping.noteSnapshots[entityId];
  } else {
    await deleteCards([entityId], { source: 'lineage-update' });
    mapping.cardIds = mapping.cardIds.filter((x) => x !== entityId);
    delete mapping.cardSnapshots[entityId];
  }
}

/** Refresh the mapping snapshot for an entity whose local content was just changed. */
async function refreshSnapshot(
  kind: MergeReviewItemKind,
  entityId: string,
  mapping: LineageIdMapping,
): Promise<void> {
  if (kind === 'lesson') {
    const lesson = await db.lessons.get(entityId);
    if (lesson) mapping.lessonSnapshots[entityId] = lessonSnapshot(toExistingLesson(lesson));
  } else if (kind === 'note') {
    const note = await db.notes.get(entityId);
    if (note) mapping.noteSnapshots[entityId] = noteSnapshot(toExistingNote(note));
  } else {
    const card = await db.cards.get(entityId);
    if (card) mapping.cardSnapshots[entityId] = cardSnapshot(toExistingCard(card));
  }
}

/** Apply a queued content update (accept "their" version of a plain, non-conflicting
 *  change) through the same repository writes the auto-accept branch uses. */
async function applyQueuedUpdate(
  kind: MergeReviewItemKind,
  update:
    | PendingDiff['updates']['lessons'][number]
    | PendingDiff['updates']['notes'][number]
    | PendingDiff['updates']['cards'][number],
  mapping: LineageIdMapping,
): Promise<void> {
  const id = update.id;
  if (kind === 'lesson') {
    const { id: _id, ...changes } = update as PendingDiff['updates']['lessons'][number];
    await applyLineageLessonUpdate(id, changes);
  } else if (kind === 'note') {
    const { id: _id, ...changes } = update as PendingDiff['updates']['notes'][number];
    await updateNote(id, changes);
  } else {
    await applyCardUpdate(mapping.courseId, update as PendingDiff['updates']['cards'][number]);
  }
  await refreshSnapshot(kind, id, mapping);
}

/** Overwrite a student-edited entity with the teacher's incoming version ("take theirs"
 *  on a conflict). Unlike a plain update this replaces every content field, since the
 *  incoming version is authoritative — a field absent from the payload clears locally
 *  (Dexie deletes an `undefined`-valued property), matching first-import decode. */
async function takeIncomingConflict(
  kind: MergeReviewItemKind,
  entityId: string,
  { incoming, lessonId }: LineageConflict,
  mapping: LineageIdMapping,
): Promise<void> {
  if (kind === 'lesson') {
    const inc = incoming as ShareLessonInput;
    await applyLineageLessonUpdate(entityId, {
      prerequisiteLessonIds: inc.pr ?? [],
      name: inc.n.trim() || 'Untitled lesson',
      description: inc.d,
      isExtension: inc.x === 1,
      releaseDate: inc.rd,
      examDate: inc.ed,
      timeZone: inc.tz,
      sessionFilter: inc.sf,
      answerMode: inc.am,
    });
  } else if (kind === 'note') {
    const inc = incoming as ShareNoteInput;
    await updateNote(entityId, {
      name: inc.n.trim() || 'Untitled note',
      content: inc.c,
      ...(lessonId ? { lessonId } : {}),
    });
  } else {
    const inc = incoming as ShareCardInput;
    // Conflicts queued before lesson membership was diffed carry no lessonId.
    if (lessonId !== undefined) await assignCardsToLesson([entityId], mapping.courseId, lessonId);
    await updateCard(entityId, {
      type: shareCardKindToType(inc.k),
      front: inc.f,
      back: inc.k === 1 ? '' : (inc.b ?? ''),
      tags: inc.g ?? [],
      payload: inc.p,
      answerMode: inc.am,
    });
  }
  await refreshSnapshot(kind, entityId, mapping);
}

/** Resolve a single item in place: locate it across the three buckets, act if accepting,
 *  and remove it from the row regardless (a rejected item is simply dropped, keeping the
 *  student's current version untouched). */
async function resolveOne(
  diff: PendingDiff,
  mapping: LineageIdMapping,
  ref: MergeReviewItemRef,
  accept: boolean,
): Promise<void> {
  const updates = updatesBucket(diff, ref.kind);
  const upIdx = updates.findIndex((u) => u.id === ref.entityId);
  if (upIdx >= 0) {
    const [update] = updates.splice(upIdx, 1);
    if (accept) await applyQueuedUpdate(ref.kind, update, mapping);
    return;
  }

  const removals = removalsBucket(diff, ref.kind);
  const remIdx = removals.indexOf(ref.entityId);
  if (remIdx >= 0) {
    removals.splice(remIdx, 1);
    if (accept) await deleteAdoptedEntity(ref.kind, ref.entityId, mapping);
    return;
  }

  const cIdx = diff.conflicts.findIndex((c) => c.kind === ref.kind && c.entityId === ref.entityId);
  if (cIdx >= 0) {
    const [conflict] = diff.conflicts.splice(cIdx, 1);
    if (accept) {
      if (conflict.incoming === null) await deleteAdoptedEntity(ref.kind, ref.entityId, mapping);
      else await takeIncomingConflict(ref.kind, ref.entityId, conflict, mapping);
    }
    return;
  }
}

async function resolveMergeReviewItems(
  reviewId: string,
  refs: MergeReviewItemRef[],
  accept: boolean,
): Promise<void> {
  return db.transaction('rw', MERGE_TABLES, async () => {
    const review = await db.pendingMergeReviews.get(reviewId);
    if (!review) return;
    const mapping = await db.lineageIdMappings.get(review.lineageId);
    const workingMapping = await assertLineageReviewIntegrity(review, mapping);

    for (const ref of refs) {
      await resolveOne(review.diff, workingMapping, ref, accept);
    }

    assertLessonPrerequisites(await db.lessons.where('courseId').equals(review.courseId).toArray());
    await db.lineageIdMappings.put(workingMapping);

    if (diffIsEmpty(review.diff)) await db.pendingMergeReviews.delete(reviewId);
    else await db.pendingMergeReviews.put(review);
  });
}

/** Accept the given items: apply teacher updates, perform accepted removals, and take the
 *  teacher's version on accepted conflicts. Resolved items leave the review row. */
export async function acceptMergeReviewItems(
  reviewId: string,
  refs: MergeReviewItemRef[],
): Promise<void> {
  return resolveMergeReviewItems(reviewId, refs, true);
}

/** Reject the given items ("keep mine"): drop them from the review row, leaving the
 *  student's current version untouched. */
export async function rejectMergeReviewItems(
  reviewId: string,
  refs: MergeReviewItemRef[],
): Promise<void> {
  return resolveMergeReviewItems(reviewId, refs, false);
}

/** Accept every queued update and removal, leaving student-edited conflicts queued —
 *  the manual equivalent of `autoAcceptUpdates` for this one merge (§7.5). */
export async function acceptAllMergeReview(reviewId: string): Promise<void> {
  const review = await db.pendingMergeReviews.get(reviewId);
  if (!review) return;
  return resolveMergeReviewItems(reviewId, collectRefs(review.diff, false), true);
}

/** Reject every outstanding item, including conflicts — clears the review entirely,
 *  keeping the student's current version of everything. */
export async function rejectAllMergeReview(reviewId: string): Promise<void> {
  const review = await db.pendingMergeReviews.get(reviewId);
  if (!review) return;
  return resolveMergeReviewItems(reviewId, collectRefs(review.diff, true), false);
}
