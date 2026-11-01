import { diffLineage, type LineageDiffInput } from '@lacuna/core/db/lineageDiff';
import type {
  Card,
  Lesson,
  LineageIdMapping,
  Note,
  PendingMergeReview,
} from '@lacuna/core/db/types';
import {
  detectStudentEdits,
  toExistingCard,
  toExistingLesson,
  toExistingNote,
  toShareCardInput,
  toShareLessonInput,
  type LineagePayload,
} from './lineageImportModel';

/** Plan the merge without writing or mutating the stored mapping and entities. */
export function planLineageMerge(
  payload: LineagePayload,
  mapping: LineageIdMapping,
  existingLessons: Lesson[],
  existingNotes: Note[],
  courseCards: Card[],
) {
  const studentEdits = detectStudentEdits(mapping, existingLessons, existingNotes, courseCards);

  const diffInput: LineageDiffInput = {
    incoming: {
      lessons: payload.lessons.map(toShareLessonInput),
      bankCards: (payload.bankCards ?? []).map(toShareCardInput),
    },
    existing: {
      lessons: existingLessons.map(toExistingLesson),
      notes: existingNotes.map(toExistingNote),
      // Locally regenerated cards are never lineage-diffed either: they are owned by
      // their sequence or occlusion, not by the mapping (see isGeneratedShareCard).
      cards: courseCards
        .filter((card) => !card.sequenceItemId && !card.occlusionRegionId)
        .map(toExistingCard),
    },
    mapping: {
      id: mapping.id,
      courseId: mapping.courseId,
      lessonIds: mapping.lessonIds,
      noteIds: mapping.noteIds,
      cardIds: mapping.cardIds,
      sequenceIds: mapping.sequenceIds,
    },
    studentEdits,
  };
  const diff = diffLineage(diffInput);

  // A removal the student has also edited is not a clean delete — queue it as a
  // conflict instead (§7.10's unresolved policy: student's copy retained until they
  // accept the removal, consistent with the student-wins default elsewhere).
  const removalLessonIds: string[] = [];
  const removalNoteIds: string[] = [];
  const removalCardIds: string[] = [];
  const conflicts: PendingMergeReview['diff']['conflicts'] = [...diff.conflicts];
  for (const id of diff.removals.lessonIds) {
    if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'lesson', incoming: null });
    else removalLessonIds.push(id);
  }
  for (const id of diff.removals.noteIds) {
    if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'note', incoming: null });
    else removalNoteIds.push(id);
  }
  for (const id of diff.removals.cardIds) {
    if (studentEdits.has(id)) conflicts.push({ entityId: id, kind: 'card', incoming: null });
    else removalCardIds.push(id);
  }

  return { diff, removalLessonIds, removalNoteIds, removalCardIds, conflicts };
}
