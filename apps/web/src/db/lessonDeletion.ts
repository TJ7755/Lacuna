import { assertLessonPrerequisites } from './lessonPrerequisites';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { scheduleAssetGc } from './assets';
import {
  ensureCourseBankBackingDeck,
  removeLessonSchedulingUnit,
  syncCourseSchedulingUnits,
} from './backingDecks';
import { replaceReviewHistoryForCards } from './cardReviewHistory';
import { friendlyDbError } from './dbErrors';
import {
  clearTombstone,
  clearTombstones,
  lessonCardExposureId,
  recordTombstone,
  recordTombstones,
  stampUpdatedAt,
} from './mutationStamp';
import {
  projectCardsForStorage,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from '@lacuna/core/db/reviewHistory';
import { db } from './schema';
import type {
  Card,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  NoteAnnotation,
  QuestionSetPracticeNode,
  SchedulingPerformance,
  SchedulingUnitRecord,
  Sequence,
  SessionHistoryEntry,
} from '@lacuna/core/db/types';

/** Everything {@link deleteLesson} removes or rewrites, captured for undo. */
export interface LessonSnapshot {
  lesson: Lesson;
  dependentLessons?: Lesson[];
  notes: Note[];
  noteAnnotations: NoteAnnotation[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletion?: LessonCompletion;
  cards: Card[];
  sequences: Sequence[];
  sessionHistory: SessionHistoryEntry[];
  courseAssessments: CourseAssessment[];
  reviewHistory: ReviewHistoryEntry[];
  schedulingUnit?: SchedulingUnitRecord;
  schedulingPerformance?: SchedulingPerformance;
  questionSets: QuestionSetRecord[];
  questionSetPracticeNodes: QuestionSetPracticeNode[];
}

/** Capture a lesson and every row {@link deleteLesson} changes before deleting it. */
export async function snapshotLesson(id: string): Promise<LessonSnapshot | null> {
  const lesson = await db.lessons.get(id);
  if (!lesson) return null;

  const [
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletion,
    cards,
    sequences,
    courseAssessments,
    schedulingUnit,
    schedulingPerformance,
    questionSets,
    practiceNodes,
  ] = await Promise.all([
    db.notes.where('lessonId').equals(id).toArray(),
    db.lessonCards.where('lessonId').equals(id).toArray(),
    db.lessonCardExposures.where('lessonId').equals(id).toArray(),
    db.lessonCompletions.get(id),
    db.cards.where('primaryLessonId').equals(id).toArray(),
    db.sequences.where('primaryLessonId').equals(id).toArray(),
    db.courseAssessments.where('courseId').equals(lesson.courseId).toArray(),
    db.schedulingUnits.get(id),
    db.schedulingPerformance.get(id),
    db.questionSets.where('lessonIds').equals(id).toArray(),
    db.practiceNodes.where('courseId').equals(lesson.courseId).toArray(),
  ]);
  const noteIds = notes.map((note) => note.id);
  const [noteAnnotations, sessionHistory, reviewHistory] = await Promise.all([
    noteIds.length > 0 ? db.noteAnnotations.where('noteId').anyOf(noteIds).toArray() : [],
    db.sessionHistory.where('courseId').equals(lesson.courseId).toArray(),
    cards.length > 0
      ? db.reviewHistory
          .where('cardId')
          .anyOf(cards.map((card) => card.id))
          .toArray()
      : [],
  ]);

  return {
    lesson,
    dependentLessons: (await db.lessons.where('courseId').equals(lesson.courseId).toArray()).filter(
      (candidate) => candidate.prerequisiteLessonIds?.includes(id),
    ),
    notes,
    noteAnnotations,
    lessonCards,
    lessonCardExposures,
    ...(lessonCompletion ? { lessonCompletion } : {}),
    cards,
    sequences,
    sessionHistory,
    courseAssessments,
    reviewHistory,
    ...(schedulingUnit ? { schedulingUnit } : {}),
    ...(schedulingPerformance ? { schedulingPerformance } : {}),
    questionSets,
    questionSetPracticeNodes: practiceNodes.filter(
      (node): node is QuestionSetPracticeNode =>
        node.type === 'question-set' && node.afterLessonId === id,
    ),
  };
}

/** Restore a lesson snapshot captured immediately before {@link deleteLesson}. */
export async function restoreLesson(snapshot: LessonSnapshot): Promise<void> {
  try {
    const cardsToRestore = projectCardsForStorage(snapshot.cards);
    const reviewHistoryToRestore =
      snapshot.reviewHistory ?? snapshot.cards.flatMap((card) => reviewHistoryEntriesForCard(card));
    const { restoreQuestionSetLessonReferences } =
      await import('../questions/questionSetRepository');
    await db.transaction(
      'rw',
      [
        db.lessons,
        db.notes,
        db.noteAnnotations,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.cards,
        db.sequences,
        db.sessionHistory,
        db.courseAssessments,
        db.reviewHistory,
        db.schedulingUnits,
        db.schedulingPerformance,
        db.questionSets,
        db.practiceNodes,
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await restoreQuestionSetLessonReferences(
          snapshot.questionSets ?? [],
          snapshot.lesson.id,
          Date.now(),
        );
        await Promise.all([
          db.lessons.put(snapshot.lesson),
          db.notes.bulkPut(snapshot.notes),
          db.noteAnnotations.bulkPut(snapshot.noteAnnotations),
          db.lessonCards.bulkPut(snapshot.lessonCards),
          db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures),
          snapshot.lessonCompletion
            ? db.lessonCompletions.put(snapshot.lessonCompletion)
            : Promise.resolve(),
          db.cards.bulkPut(cardsToRestore),
          db.sequences.bulkPut(snapshot.sequences),
          db.sessionHistory.bulkPut(snapshot.sessionHistory),
          db.courseAssessments.bulkPut(snapshot.courseAssessments),
          db.practiceNodes.bulkPut(snapshot.questionSetPracticeNodes ?? []),
          snapshot.schedulingUnit
            ? db.schedulingUnits.put(snapshot.schedulingUnit)
            : Promise.resolve(),
          snapshot.schedulingPerformance
            ? db.schedulingPerformance.put(snapshot.schedulingPerformance)
            : Promise.resolve(),
        ]);
        for (const dependent of snapshot.dependentLessons ?? []) {
          const current = await db.lessons.get(dependent.id);
          if (
            current?.courseId === snapshot.lesson.courseId &&
            !current.prerequisiteLessonIds?.includes(snapshot.lesson.id)
          ) {
            await db.lessons.update(
              current.id,
              stampUpdatedAt(
                {
                  prerequisiteLessonIds: [
                    ...(current.prerequisiteLessonIds ?? []),
                    snapshot.lesson.id,
                  ],
                },
                Math.max(Date.now(), current.updatedAt + 1),
              ),
            );
          }
        }
        assertLessonPrerequisites(
          await db.lessons.where('courseId').equals(snapshot.lesson.courseId).toArray(),
        );
        await clearTombstone(tx, 'lessons', snapshot.lesson.id);
        await clearTombstones(
          tx,
          'practiceNodes',
          (snapshot.questionSetPracticeNodes ?? []).map((node) => node.id),
        );
        await clearTombstones(
          tx,
          'notes',
          snapshot.notes.map((note) => note.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          snapshot.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          snapshot.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
        if (snapshot.lessonCompletion) {
          await clearTombstone(tx, 'lessonCompletions', snapshot.lessonCompletion.lessonId);
        }
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'sequences',
          snapshot.sequences.map((sequence) => sequence.id),
        );
        await clearTombstones(
          tx,
          'courseAssessments',
          snapshot.courseAssessments.map((assessment) => assessment.id),
        );
        if (snapshot.schedulingUnit) {
          await clearTombstone(tx, 'schedulingUnits', snapshot.schedulingUnit.id);
        }
        if (snapshot.schedulingPerformance) {
          await clearTombstone(
            tx,
            'schedulingPerformance',
            snapshot.schedulingPerformance.schedulingUnitId,
          );
        }
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Delete a lesson: remove its notes and lessonCard links in one transaction.
 * Cards whose primaryLessonId pointed here become unassigned (primaryLessonId set
 * to null) rather than deleted — they remain in the question bank. Sibling
 * lessons are not renumbered.
 */
export async function deleteLesson(id: string): Promise<void> {
  const lesson = await db.lessons.get(id);
  if (!lesson) return;
  const [cardCount, sequenceCount, orderedLessons] = await Promise.all([
    db.cards.where('primaryLessonId').equals(id).count(),
    db.sequences.where('primaryLessonId').equals(id).count(),
    db.lessons.where('courseId').equals(lesson.courseId).sortBy('orderIndex'),
  ]);
  const deletedIndex = orderedLessons.findIndex((candidate) => candidate.id === id);
  const precedingLessonId = deletedIndex > 0 ? orderedLessons[deletedIndex - 1].id : null;
  const bankDeckId =
    cardCount > 0 || sequenceCount > 0 ? await ensureCourseBankBackingDeck(lesson.courseId) : null;
  const { removeQuestionSetLessonReference } = await import('../questions/questionSetRepository');
  await db.transaction(
    'rw',
    [
      db.courses,
      db.concepts,
      db.lessons,
      db.notes,
      db.noteAnnotations,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.cards,
      db.questionSets,
      db.practiceNodes,
      db.sequences,
      db.sessionHistory,
      db.courseAssessments,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.tombstones,
    ],
    async (tx) => {
      const now = Date.now();
      const noteIds = (await db.notes.where('lessonId').equals(id).primaryKeys()).map(String);
      const lessonCards = await db.lessonCards.where('lessonId').equals(id).toArray();
      const exposures = await db.lessonCardExposures.where('lessonId').equals(id).toArray();
      const completion = await db.lessonCompletions.get(id);
      const schedulingUnit = await db.schedulingUnits.get(id);
      const schedulingPerformance = await db.schedulingPerformance.get(id);
      if (noteIds.length > 0) {
        await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
      }
      await db.notes.where('lessonId').equals(id).delete();
      await db.lessonCards.where('lessonId').equals(id).delete();
      await db.lessonCardExposures.where('lessonId').equals(id).delete();
      await db.lessonCompletions.delete(id);
      if (bankDeckId) {
        const movedCards = await db.cards.where('primaryLessonId').equals(id).toArray();
        await db.cards
          .where('primaryLessonId')
          .equals(id)
          .modify(
            stampUpdatedAt(
              {
                primaryLessonId: null,
                deckId: bankDeckId,
                schedulingUnitId: lesson.courseId,
              },
              now,
            ),
          );
        if (movedCards.length > 0) {
          await db.reviewHistory
            .where('cardId')
            .anyOf(movedCards.map((card) => card.id))
            .modify({
              primaryLessonId: null,
              deckId: bankDeckId,
              schedulingUnitId: lesson.courseId,
            });
        }
        await db.sequences
          .where('primaryLessonId')
          .equals(id)
          .modify(stampUpdatedAt({ primaryLessonId: null }, now));
      }
      await removeLessonSchedulingUnit(id);
      await removeQuestionSetLessonReference(lesson.courseId, id, now);
      const questionSetPracticeNodes = (
        await db.practiceNodes.where('courseId').equals(lesson.courseId).toArray()
      ).filter((node) => node.type === 'question-set' && node.afterLessonId === id);
      for (const node of questionSetPracticeNodes) {
        await db.practiceNodes.delete(node.id);
        await recordTombstone(tx, 'practiceNodes', node.id, Math.max(now, node.updatedAt + 1));
      }
      const dependants = await db.lessons.where('courseId').equals(lesson.courseId).toArray();
      for (const dependent of dependants) {
        if (!dependent.prerequisiteLessonIds?.includes(id)) continue;
        await db.lessons.update(
          dependent.id,
          stampUpdatedAt(
            {
              prerequisiteLessonIds: dependent.prerequisiteLessonIds.filter(
                (target) => target !== id,
              ),
            },
            Math.max(now, dependent.updatedAt + 1),
          ),
        );
      }
      await db.lessons.delete(id);
      await recordTombstone(tx, 'lessons', id);
      await recordTombstones(tx, 'notes', noteIds);
      await recordTombstones(
        tx,
        'lessonCards',
        lessonCards.map((link) => link.id),
      );
      await recordTombstones(
        tx,
        'lessonCardExposures',
        exposures.map((exposure) => lessonCardExposureId(exposure.lessonId, exposure.cardId)),
      );
      if (completion) await recordTombstone(tx, 'lessonCompletions', id);
      if (schedulingUnit) await recordTombstone(tx, 'schedulingUnits', id);
      if (schedulingPerformance) await recordTombstone(tx, 'schedulingPerformance', id);

      const [remainingLessons, courseCards, courseLinks, assessments, course, concepts] =
        await Promise.all([
          db.lessons.where('courseId').equals(lesson.courseId).toArray(),
          db.cards.where('courseId').equals(lesson.courseId).toArray(),
          db.lessonCards.toArray(),
          db.courseAssessments.where('courseId').equals(lesson.courseId).toArray(),
          db.courses.get(lesson.courseId),
          db.concepts.where('courseId').equals(lesson.courseId).toArray(),
        ]);
      for (const assessment of assessments) {
        const lostPlacement = assessment.afterLessonId === id;
        const lostCustomLesson =
          assessment.coverageMode === 'custom' && assessment.lessonIds.includes(id);
        let updated: CourseAssessment = {
          ...assessment,
          ...(lostPlacement ? { afterLessonId: precedingLessonId } : {}),
          ...(lostCustomLesson
            ? { lessonIds: assessment.lessonIds.filter((lessonId) => lessonId !== id) }
            : {}),
          ...(lostPlacement || lostCustomLesson ? { needsAuthorConfirmation: true } : {}),
        } as CourseAssessment;
        const withoutExclusions = { ...updated, excludedCardIds: [] } as CourseAssessment;
        const coveredCardIds = new Set(
          resolveAssessmentCoverage(
            withoutExclusions,
            remainingLessons,
            courseCards,
            courseLinks,
            undefined,
            { course, concepts },
          ).cards.map((card) => card.id),
        );
        const excludedCardIds = updated.excludedCardIds.filter((cardId) =>
          coveredCardIds.has(cardId),
        );
        if (excludedCardIds.length !== updated.excludedCardIds.length) {
          updated = {
            ...updated,
            excludedCardIds,
            needsAuthorConfirmation: true,
          } as CourseAssessment;
        }
        await db.courseAssessments.put(stampUpdatedAt(updated, now));
      }
      await syncCourseSchedulingUnits(lesson.courseId);
    },
  );
  scheduleAssetGc();
}
