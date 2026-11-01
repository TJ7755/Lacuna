import {
  specificationAssessmentPointIds,
  validatePaperAssessmentDates,
} from '../specifications/assessment';
import { assertShareSpecificationAssessments } from './sharePayload';
import { earlierCourseLessonIds } from '../course/courseEntry';
/**
 * Classroom-distribution merge importer.
 *
 * Two entry points:
 *  - {@link importLineageFirstTime} — first import of a published lineage. Adopts every
 *    incoming lesson/note/card's originating id directly as the local id (§7.1's id
 *    adoption decision — never `makeId()`), and creates the `LineageIdMapping`
 *    membership registry that every later merge consults.
 *  - {@link mergeLineageUpdate} — re-import of an updated code against a course that
 *    already tracks the lineage. Runs the pure diff (`src/db/lineageDiff.ts`) against the
 *    current local state, applies creates unconditionally, applies or queues
 *    updates/removals per `distributedCopy.autoAcceptUpdates`, and always queues
 *    conflicts — never silently discarding or overwriting a student's own edit.
 *
 * Sequence-shaped payload items never go through `lineageDiff.ts` (out of scope by
 * design, §7.1/§7.3) — both entry points hand them to `updateSequence`
 * (`src/db/repository.ts`), which already owns "diff against the previous generation,
 * touch content fields only" via `diffRegeneration`. `updateSequence` also covers the
 * create case: `db.sequences.put` on an id with no existing row is an insert, and its
 * internal diff against zero existing cards is all-creates.
 *
 * Linked bank cards are adopted and diffed like lesson cards, with no lesson; lesson-card
 * links take deterministic ids and follow the payload on every import. Published
 * assessment identities are adopted with Question Sets so their links survive updates.
 *
 * This module uses Dexie directly (never edits `src/db/repository.ts`, owned by a
 * concurrent Arc 7 task) but does import its existing, unmodified exports for creates,
 * updates and deletes wherever they already do the right thing. Hidden scheduling-deck
 * resolution is kept in `src/db/backingDecks.ts`, alongside the equivalent share import
 * path.
 */

import { assertLessonPrerequisites, assertShareLessonPrerequisites } from './lessonPrerequisites';
import { db, makeId } from './schema';
import { createCourse, deleteCards, deleteLesson, deleteNote, updateNote } from './repository';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  syncCourseSchedulingUnits,
} from './backingDecks';
import { clearTombstone, stampUpdatedAt } from './mutationStamp';
import { assertValidCardPayload } from '../items/payloadValidation';
import { buildCardConcept, conceptNameForCard } from '../questions/concepts';
import { planLineageMerge } from './lineageMergePlanning';
import { courseDetailChanges, courseSource } from './mergeImportCourseDetails';
import {
  applyImportedCourseScheduling,
  importSharePayload,
  type ImportCourseScheduling,
} from './share';
import type { SharePayload } from './share';
import type {
  Card,
  Course,
  CourseRecord,
  Lesson,
  ItemPayload,
  Note,
  PendingMergeReview,
} from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import { prepareLineageMapping } from './lineageIntegrity';
import { clampRequestRetention, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import {
  applyLineageQuestionSets,
  applyLineageQuestionSetPracticeNodes,
  assertStoredQuestionSetActivities,
} from '../questions/questionSetLineage';
import { applyLineageAssessments } from './assessmentLineage';
import { finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';

import {
  cardSnapshot,
  emptyMapping,
  incomingCardConceptIds,
  isGeneratedShareCard,
  isLineagePayload,
  lessonSnapshot,
  lineageCardConceptId,
  noteSnapshot,
  reverseCardId,
  shareCardKindToType,
  toExistingCard,
  toExistingLesson,
  toExistingNote,
} from './lineageImportModel';
import type { LineagePayload, ShareCard } from './lineageImportModel';
import { MERGE_TABLES } from './lineageImportTables';
import {
  applyLineageQuestions,
  pruneRemovedLineageConcepts,
  upsertLineageConcepts,
} from './lineageQuestionImport';
import { applyOcclusions, applySequences } from './lineageGeneratedImport';
import {
  applyCardUpdate,
  applyCreates,
  applyLineageLessonUpdate,
  syncLineageLinks,
} from './lineageImportEntities';

export { detectStudentEdits, isLineagePayload } from './lineageImportModel';
export {
  acceptAllMergeReview,
  acceptMergeReviewItems,
  rejectAllMergeReview,
  rejectMergeReviewItems,
} from './mergeReview';
export type { MergeReviewItemKind, MergeReviewItemRef } from './mergeReview';

async function lineageIdsInUse(payload: LineagePayload): Promise<boolean> {
  const lessonIds = payload.lessons.flatMap((lesson) => (lesson.i ? [lesson.i] : []));
  const noteIds = payload.lessons.flatMap((lesson) =>
    lesson.notes.flatMap((note) => (note.oi ? [note.oi] : [])),
  );
  const cardIds = [
    ...payload.lessons.flatMap((lesson) => lesson.cards),
    ...(payload.bankCards ?? []),
  ]
    .filter((card) => !isGeneratedShareCard(card))
    .flatMap((card) => (card.id ? [card.id] : []));
  const [lessons, notes, cards] = await Promise.all([
    db.lessons.bulkGet(lessonIds),
    db.notes.bulkGet(noteIds),
    db.cards.bulkGet(cardIds),
  ]);
  return [...lessons, ...notes, ...cards].some((row) => row !== undefined);
}

/**
 * First import of a published lineage (§7.1/§7.2/§7.9 Task 5). Diverges from
 * `importCourseSharePayload` (`share.ts:1083`) precisely in id handling: every
 * lesson/note/card adopts its incoming originating id directly as the local id
 * instead of `makeId()`, and a `LineageIdMapping` membership registry plus initial
 * content snapshots are written so the next re-import can diff against this state.
 */
export async function importLineageFirstTime(
  payload: SharePayload,
  scheduling?: ImportCourseScheduling,
): Promise<{ course: Course }> {
  if (!isLineagePayload(payload)) {
    throw new Error('Payload does not carry a course lineage (missing li/rv).');
  }
  assertShareLessonPrerequisites(payload.lessons);
  assertShareSpecificationAssessments(payload);
  // A detached copy (or the teacher's own course) already holds these ids, and
  // adoption cannot reuse them, so fall back to a plain, untracked import.
  if (await lineageIdsInUse(payload)) {
    const { courseIds } = await importSharePayload(payload, scheduling);
    const course = await db.courses.get(courseIds[0]);
    if (!course) throw new Error('Course not found.');
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    return { course: hydrateCourse(course, finalAssessmentForCourse(course.id, assessments)) };
  }

  return db.transaction('rw', MERGE_TABLES, async (tx) => {
    const course = await createCourse(payload.course.n || 'Shared course', {
      description: payload.course.d ?? '',
      creator: payload.by ?? undefined,
      ...(payload.course.specificationRef === undefined
        ? {}
        : { specificationRef: payload.course.specificationRef }),
      ...(payload.course.specificationData === undefined
        ? {}
        : { specificationData: payload.course.specificationData }),
      ...(payload.course.examBoard === undefined ? {} : { examBoard: payload.course.examBoard }),
      ...(payload.course.specification === undefined
        ? {}
        : { specification: payload.course.specification }),
      examObjective: payload.course.o === 1 ? 'securedTopics' : 'expectedMarks',
      createdAt: payload.course.c,
      schedulingMode: payload.course.sm === 1 ? 'steady' : 'exam',
      ...(payload.course.e === undefined ? {} : { examDate: payload.course.e }),
      // Seeded from the teacher like a plain share import; the learner owns them after.
      fsrsParameters: {
        ...defaultFsrsParameters(),
        ...(typeof payload.course.r === 'number'
          ? { requestRetention: clampRequestRetention(payload.course.r) }
          : {}),
      },
      ...(payload.course.p && payload.course.p > 0 ? { newCardsPerDay: payload.course.p } : {}),
      unlockMode: payload.course.um,
      ...(payload.course.lf === 0 ? { learnFirst: false } : {}),
      lessonViewMode: 'study',
      ...(payload.course.l ? { colour: payload.course.l } : {}),
      distributedCopy: {
        lineageId: payload.li,
        revision: payload.rv,
        locked: true,
        autoAcceptUpdates: true,
        source: courseSource(payload),
        ...(typeof payload.by === 'string' ? { sourceLabel: payload.by } : {}),
      },
    });

    const mapping = emptyMapping(payload.li, course.id);
    const createdAt = Date.now();
    const previousConceptIds = await upsertLineageConcepts(payload, course.id, mapping);

    const newLessons: Lesson[] = payload.lessons.map((shareLesson, orderIndex) => {
      if (!shareLesson.i) throw new Error('Lineage payload lesson is missing its originating id.');
      return {
        id: shareLesson.i,
        prerequisiteLessonIds: shareLesson.pr,
        courseId: course.id,
        name: shareLesson.n.trim() || 'Untitled lesson',
        orderIndex,
        createdAt: createdAt + orderIndex,
        updatedAt: createdAt + orderIndex,
        ...(shareLesson.d ? { description: shareLesson.d } : {}),
        isExtension: shareLesson.x === 1,
        ...(typeof shareLesson.rd === 'number' ? { releaseDate: shareLesson.rd } : {}),
        ...(typeof shareLesson.ed === 'number' ? { examDate: shareLesson.ed } : {}),
        ...(shareLesson.tz ? { timeZone: shareLesson.tz } : {}),
        ...(shareLesson.sf ? { sessionFilter: shareLesson.sf } : {}),
        answerMode: shareLesson.am,
      };
    });
    if (newLessons.length > 0) await db.lessons.bulkAdd(newLessons);
    for (const lesson of newLessons) {
      mapping.lessonIds.push(lesson.id);
      mapping.lessonSnapshots[lesson.id] = lessonSnapshot(toExistingLesson(lesson));
    }

    const newNotes: Note[] = payload.lessons.flatMap((shareLesson, lessonIndex) =>
      shareLesson.notes.map((shareNote, orderIndex) => {
        if (!shareNote.oi) throw new Error('Lineage payload note is missing its originating id.');
        return {
          id: shareNote.oi,
          lessonId: newLessons[lessonIndex].id,
          name: shareNote.n.trim() || 'Untitled note',
          content: shareNote.c,
          orderIndex,
          createdAt: createdAt + orderIndex,
          updatedAt: createdAt + orderIndex,
        };
      }),
    );
    if (newNotes.length > 0) await db.notes.bulkAdd(newNotes);
    for (const note of newNotes) {
      mapping.noteIds.push(note.id);
      mapping.noteSnapshots[note.id] = noteSnapshot(toExistingNote(note));
    }

    const newCards: Card[] = [];
    const newConcepts: Concept[] = [];
    // Linked bank cards are adopted like lesson cards, with no lesson.
    const cardGroups: Array<{ lessonId: string | null; cards: ShareCard[] }> = [
      ...payload.lessons.map((shareLesson, lessonIndex) => ({
        lessonId: newLessons[lessonIndex].id,
        cards: shareLesson.cards,
      })),
      { lessonId: null, cards: payload.bankCards ?? [] },
    ];
    for (const { lessonId, cards } of cardGroups) {
      if (cards.every(isGeneratedShareCard)) continue;
      const deckId = lessonId
        ? await ensureLessonBackingDeck(course.id, lessonId)
        : await ensureCourseBankBackingDeck(course.id);
      let cardCreatedAt = createdAt;
      for (const shareCard of cards) {
        if (isGeneratedShareCard(shareCard)) continue;
        if (!shareCard.id) throw new Error('Lineage payload card is missing its originating id.');
        const type = shareCardKindToType(shareCard.k);
        assertValidCardPayload(type, shareCard.p);
        const conceptId = payload.v !== 2 ? shareCard.co : lineageCardConceptId(shareCard.id);
        if (!conceptId) {
          throw new Error(`A shared Card references a missing Concept: ${shareCard.id}.`);
        }
        if (payload.v === 2) {
          newConcepts.push(
            buildCardConcept({
              id: conceptId,
              courseId: course.id,
              schedulingUnitId: deckId,
              name: conceptNameForCard(type, shareCard.f, shareCard.b ?? ''),
              now: cardCreatedAt,
            }),
          );
        }
        const base = {
          conceptId,
          deckId,
          courseId: course.id,
          primaryLessonId: lessonId,
          schedulingUnitId: deckId,
          stability: null,
          difficulty: null,
          lastReviewed: null,
          reps: 0,
          lapses: 0,
          state: 0 as const,
          due: null,
          scheduledDays: 0,
          learningSteps: 0,
          history: [],
          tags: shareCard.g ?? [],
          payload: shareCard.p as ItemPayload | undefined,
          answerMode: shareCard.am,
          suspended: false,
          buriedUntil: null,
        };
        if (shareCard.k === 2) {
          // See reverseCardId's doc comment: unreachable via today's course export, but
          // handled the way `unpackCard` decodes it (two independent front_back cards)
          // for robustness.
          const back = shareCard.b ?? '';
          newCards.push({
            id: shareCard.id,
            type: 'front_back',
            front: shareCard.f,
            back,
            createdAt: cardCreatedAt,
            updatedAt: cardCreatedAt++,
            ...base,
          });
          newCards.push({
            id: reverseCardId(shareCard.id),
            type: 'front_back',
            front: back,
            back: shareCard.f,
            createdAt: cardCreatedAt,
            updatedAt: cardCreatedAt++,
            ...base,
          });
        } else {
          newCards.push({
            id: shareCard.id,
            type,
            front: shareCard.f,
            back: shareCard.k === 1 ? '' : (shareCard.b ?? ''),
            createdAt: cardCreatedAt,
            updatedAt: cardCreatedAt++,
            ...base,
          });
        }
      }
    }
    if (newConcepts.length > 0) await db.concepts.bulkAdd(newConcepts);
    if (newCards.length > 0) await db.cards.bulkAdd(newCards);
    for (const card of newCards) {
      mapping.cardIds.push(card.id);
      mapping.cardSnapshots[card.id] = cardSnapshot(toExistingCard(card));
    }

    const lessonIdByIndex = (index: number) => newLessons[index]?.id ?? null;
    await applySequences(payload, course.id, lessonIdByIndex, mapping);
    await applyOcclusions(payload, course.id, lessonIdByIndex, mapping);
    await syncLineageLinks(tx, payload, course.id);
    await applyLineageQuestions(payload, course.id, mapping);
    if (payload.v === 4 || payload.v === 5 || payload.v === 6)
      await applyLineageAssessments(payload, course.id, mapping, true);
    if (payload.v === 4 || payload.v === 5 || payload.v === 6)
      await applyLineageQuestionSets(payload, course.id, mapping);
    if (payload.v === 5 || payload.v === 6)
      await applyLineageQuestionSetPracticeNodes(payload, course.id, mapping);
    await assertStoredQuestionSetActivities(course.id);
    await pruneRemovedLineageConcepts(previousConceptIds, mapping, payload.at);
    await syncCourseSchedulingUnits(course.id);

    await db.lineageIdMappings.put(mapping);
    // Re-importing a lineage after detach revives its registry, so drop the
    // deletion receipt — the same restore-clears-tombstone rule delete/undo uses.
    await clearTombstone(tx, 'lineageIdMappings', payload.li);
    await db.pendingMergeReviews.where('courseId').equals(course.id).delete();

    if (scheduling) await applyImportedCourseScheduling(course.id, scheduling);
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    return { course: hydrateCourse(course, finalAssessmentForCourse(course.id, assessments)) };
  });
}

export interface MergeLineageResult {
  createdLessons: number;
  createdNotes: number;
  createdCards: number;
  appliedUpdates: number;
  appliedRemovals: number;
  queuedForReview: boolean;
  conflictCount: number;
}

/**
 * Re-import an updated share code against a course that already tracks the payload's
 * lineage (§7.5's "merge apply, in order" steps 1-6). `courseId` must already carry a
 * matching `distributedCopy.lineageId` — routing that decision is Task 9's job
 * (`SharePage`/`UnifiedImportPanel`'s decode-time branch); this function assumes the
 * caller has already established the match.
 */
export async function mergeLineageUpdate(
  courseId: string,
  payload: SharePayload,
): Promise<MergeLineageResult> {
  if (!isLineagePayload(payload)) {
    throw new Error('Payload does not carry a course lineage (missing li/rv).');
  }

  assertShareLessonPrerequisites(payload.lessons);
  assertShareSpecificationAssessments(payload);
  return db.transaction('rw', MERGE_TABLES, async (tx) => {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('Course not found.');
    const dc = course.distributedCopy;
    if (!dc || dc.lineageId !== payload.li) {
      throw new Error('Course is not an imported copy of this lineage.');
    }

    const existingMapping = await db.lineageIdMappings.get(payload.li);
    const mapping = existingMapping ?? emptyMapping(payload.li, courseId);
    await prepareLineageMapping(payload, courseId, mapping);
    const previousConceptIds = await upsertLineageConcepts(payload, courseId, mapping);
    const conceptIdByCard = payload.v !== 2 ? incomingCardConceptIds(payload) : undefined;

    const [existingLessons, courseCards] = await Promise.all([
      db.lessons.where('courseId').equals(courseId).toArray(),
      db.cards.where('courseId').equals(courseId).toArray(),
    ]);
    const lessonIds = existingLessons.map((l) => l.id);
    const existingNotes = lessonIds.length
      ? await db.notes.where('lessonId').anyOf(lessonIds).toArray()
      : [];

    const { diff, removalLessonIds, removalNoteIds, removalCardIds, conflicts } = planLineageMerge(
      payload,
      mapping,
      existingLessons,
      existingNotes,
      courseCards,
    );

    // 1. Creates are always applied immediately (§7.5 step 2) — purely additive.
    const createdAt = Date.now();
    const created = await applyCreates(courseId, createdAt, diff.creates, mapping, conceptIdByCard);
    if (created.lessons.length > 0) await syncCourseSchedulingUnits(courseId);

    // 2/3. Updates and removals: apply now if autoAcceptUpdates, otherwise queue.
    let appliedUpdates = 0;
    let appliedRemovals = 0;
    const queuedUpdates = {
      lessons: diff.updates.lessons,
      notes: diff.updates.notes,
      cards: diff.updates.cards,
    };
    const queuedRemovals = {
      lessonIds: removalLessonIds,
      noteIds: removalNoteIds,
      cardIds: removalCardIds,
    };

    if (dc.autoAcceptUpdates) {
      for (const update of diff.updates.lessons) {
        const { id, ...changes } = update;
        await applyLineageLessonUpdate(id, changes);
        appliedUpdates++;
      }
      for (const update of diff.updates.notes) {
        const { id, ...changes } = update;
        await updateNote(id, changes);
        appliedUpdates++;
      }
      for (const update of diff.updates.cards) {
        await applyCardUpdate(courseId, update);
        appliedUpdates++;
      }
      for (const id of removalLessonIds) {
        await deleteLesson(id);
        appliedRemovals++;
      }
      for (const id of removalNoteIds) {
        await deleteNote(id);
        appliedRemovals++;
      }
      if (removalCardIds.length > 0) {
        await deleteCards(removalCardIds, { source: 'lineage-update' });
        appliedRemovals += removalCardIds.length;
      }
      queuedUpdates.lessons = [];
      queuedUpdates.notes = [];
      queuedUpdates.cards = [];
      queuedRemovals.lessonIds = [];
      queuedRemovals.noteIds = [];
      queuedRemovals.cardIds = [];
    }

    // Refresh the mapping's snapshots for every entity whose incoming content was just
    // applied (creates and, when auto-accepted, updates) so the *next* merge's
    // student-edit detection compares against what is now on disk. Entities left
    // queued (not auto-accepted) or in conflict keep their old snapshot on purpose —
    // nothing changed locally for them yet.
    if (dc.autoAcceptUpdates) {
      for (const update of diff.updates.lessons) {
        const lesson = await db.lessons.get(update.id);
        if (lesson) mapping.lessonSnapshots[update.id] = lessonSnapshot(toExistingLesson(lesson));
      }
      for (const update of diff.updates.notes) {
        const note = await db.notes.get(update.id);
        if (note) mapping.noteSnapshots[update.id] = noteSnapshot(toExistingNote(note));
      }
      for (const update of diff.updates.cards) {
        const card = await db.cards.get(update.id);
        if (card) mapping.cardSnapshots[update.id] = cardSnapshot(toExistingCard(card));
      }
      for (const id of removalLessonIds) {
        mapping.lessonIds = mapping.lessonIds.filter((x) => x !== id);
        delete mapping.lessonSnapshots[id];
      }
      for (const id of removalNoteIds) {
        mapping.noteIds = mapping.noteIds.filter((x) => x !== id);
        delete mapping.noteSnapshots[id];
      }
      for (const id of removalCardIds) {
        mapping.cardIds = mapping.cardIds.filter((x) => x !== id);
        delete mapping.cardSnapshots[id];
      }
    }

    // 4. Sequences hand off to `updateSequence` unconditionally (§7.1/§7.5 step 5) —
    // never gated by autoAcceptUpdates, mirroring how a local sequence edit is never a
    // "pending review" concept either.
    const lessonIdByIndex = (index: number): string | null => {
      const shareLesson = payload.lessons[index];
      if (!shareLesson?.i) return null;
      return shareLesson.i;
    };
    await applySequences(payload, courseId, lessonIdByIndex, mapping);
    await applyOcclusions(payload, courseId, lessonIdByIndex, mapping);
    await syncLineageLinks(tx, payload, courseId);
    if (conceptIdByCard) {
      for (const [cardId, conceptId] of conceptIdByCard) {
        const card = await db.cards.get(cardId);
        if (card && card.conceptId !== conceptId) {
          await db.cards.update(
            cardId,
            stampUpdatedAt({ conceptId }, Math.max(Date.now(), card.updatedAt + 1)),
          );
        }
      }
    }
    await applyLineageQuestions(payload, courseId, mapping);
    if (payload.v === 4 || payload.v === 5 || payload.v === 6)
      await applyLineageAssessments(payload, courseId, mapping);
    if (payload.v === 4 || payload.v === 5 || payload.v === 6)
      await applyLineageQuestionSets(payload, courseId, mapping);
    if (payload.v === 5 || payload.v === 6)
      await applyLineageQuestionSetPracticeNodes(payload, courseId, mapping);
    await assertStoredQuestionSetActivities(courseId);
    await pruneRemovedLineageConcepts(previousConceptIds, mapping, payload.at);

    // 6. Course details, revision + mapping bookkeeping. A detail the learner changed
    // since the last import (it no longer matches `dc.source`) is theirs to keep.
    const source = courseSource(payload);
    const detailChanges = courseDetailChanges(course, source);
    // A teacher import may update its locked copy; public authoring mutations remain gated.
    await db.courses.update(
      courseId,
      stampUpdatedAt({
        ...detailChanges,
        ...(course.schoolCoveredLessonIds === undefined && course.studyStartLessonId
          ? { schoolCoveredLessonIds: [...earlierCourseLessonIds(course, existingLessons, [], [])] }
          : {}),
        distributedCopy: {
          ...dc,
          revision: payload.rv,
          source,
          sourceLabel: payload.by ?? undefined,
        },
      }),
    );
    const updatedCourse = await db.courses.get(courseId);
    const updatedAssessments = await db.courseAssessments
      .where('courseId')
      .equals(courseId)
      .toArray();
    for (const assessment of updatedAssessments) {
      specificationAssessmentPointIds(assessment, updatedCourse);
    }
    validatePaperAssessmentDates(updatedAssessments);
    await syncCourseSchedulingUnits(courseId);
    await db.lineageIdMappings.put(mapping);

    // Queue whatever remains unresolved, superseding any previous pending row for this
    // course (§7.10's second risk — one outstanding diff, never an accumulating history).
    await db.pendingMergeReviews.where('courseId').equals(courseId).delete();
    const hasQueuedContent =
      queuedUpdates.lessons.length > 0 ||
      queuedUpdates.notes.length > 0 ||
      queuedUpdates.cards.length > 0 ||
      queuedRemovals.lessonIds.length > 0 ||
      queuedRemovals.noteIds.length > 0 ||
      queuedRemovals.cardIds.length > 0 ||
      conflicts.length > 0;
    if (hasQueuedContent) {
      const review: PendingMergeReview = {
        id: makeId(),
        courseId,
        lineageId: payload.li,
        revision: payload.rv,
        diff: {
          creates: { lessons: [], notes: [], cards: [] },
          updates: queuedUpdates,
          removals: queuedRemovals,
          conflicts,
        },
        createdAt: Date.now(),
      };
      await db.pendingMergeReviews.add(review);
    }

    assertLessonPrerequisites(await db.lessons.where('courseId').equals(courseId).toArray());
    return {
      createdLessons: created.lessons.length,
      createdNotes: created.notes.length,
      createdCards: created.cards.length,
      appliedUpdates,
      appliedRemovals,
      queuedForReview: hasQueuedContent,
      conflictCount: conflicts.length,
    };
  });
}

/** Find the local course record (if any) already tracking the given lineage — used by
 *  the decode-time routing this task hands off to Task 9. Exported here since the merge
 *  path is the natural owner of "what does it mean to already track a lineage". Returns
 *  the raw `CourseRecord` (not the hydrated `Course`, which needs an assessment lookup
 *  this check does not require). */
export async function findCourseForLineage(lineageId: string): Promise<CourseRecord | undefined> {
  return db.courses.filter((c) => c.distributedCopy?.lineageId === lineageId).first();
}
