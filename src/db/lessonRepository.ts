// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { scheduleAssetGc } from './assets';
import {
  ensureCourseBankBackingDeck,
  removeLessonSchedulingUnit,
  syncCourseSchedulingUnits,
} from './backingDecks';
import { replaceReviewHistoryForCards } from './cardRepository';
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
} from './reviewHistory';
import { db, makeId } from './schema';
import type {
  Card,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  NoteAnnotation,
  SchedulingPerformance,
  SchedulingUnitRecord,
  Sequence,
  SessionHistoryEntry,
} from './types';
// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function createLesson(
  courseId: string,
  name: string,
  opts?: Partial<Lesson>,
): Promise<Lesson> {
  try {
    const existing = await db.lessons.where('courseId').equals(courseId).toArray();
    const maxIndex = existing.reduce((m, l) => Math.max(m, l.orderIndex), -1);
    const createdAt = Date.now();
    const lesson = stampUpdatedAt(
      {
        id: makeId(),
        courseId,
        name: name.trim() || 'Untitled lesson',
        orderIndex: maxIndex + 1,
        isExtension: false,
        createdAt,
        ...opts,
      },
      createdAt,
    );
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.lessons.add(lesson);
        await syncCourseSchedulingUnits(courseId);
      },
    );
    return lesson;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateLesson(id: string, changes: Partial<Lesson>): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.lessons.update(id, stampUpdatedAt(changes));
        const lesson = await db.lessons.get(id);
        if (lesson) await syncCourseSchedulingUnits(lesson.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Everything {@link deleteLesson} removes or rewrites, captured for undo. */
export interface LessonSnapshot {
  lesson: Lesson;
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
  };
}

/** Restore a lesson snapshot captured immediately before {@link deleteLesson}. */
export async function restoreLesson(snapshot: LessonSnapshot): Promise<void> {
  try {
    const cardsToRestore = projectCardsForStorage(snapshot.cards);
    const reviewHistoryToRestore =
      snapshot.reviewHistory ?? snapshot.cards.flatMap((card) => reviewHistoryEntriesForCard(card));
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
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
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
          snapshot.schedulingUnit
            ? db.schedulingUnits.put(snapshot.schedulingUnit)
            : Promise.resolve(),
          snapshot.schedulingPerformance
            ? db.schedulingPerformance.put(snapshot.schedulingPerformance)
            : Promise.resolve(),
        ]);
        await clearTombstone(tx, 'lessons', snapshot.lesson.id);
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
 * The semi-linear unlock ratchet (Course Architecture Plan Addendum 2, §I): sets
 * `Lesson.unlockedAt` to `now` the first time the gate is satisfied, and never
 * clears or re-sets it afterwards (a one-way ratchet). No-ops if the lesson does
 * not exist or is already unlocked. Callers determine WHETHER to ratchet via
 * {@link nextLessonUnlockCondition} in src/course/unlock.ts — this function only
 * performs the write, and only under `semi-linear` unlock mode (other modes derive
 * their unlock state at read time in src/course/path.ts and have nothing to write).
 */
export async function ratchetLessonUnlock(
  lessonId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    const lesson = await db.lessons.get(lessonId);
    if (!lesson || lesson.unlockedAt !== undefined) return;
    await db.lessons.update(lessonId, stampUpdatedAt({ unlockedAt: now }, now));
  });
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
  await db.transaction(
    'rw',
    [
      db.courses,
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

      const [remainingLessons, courseCards, courseLinks, assessments] = await Promise.all([
        db.lessons.where('courseId').equals(lesson.courseId).toArray(),
        db.cards.where('courseId').equals(lesson.courseId).toArray(),
        db.lessonCards.toArray(),
        db.courseAssessments.where('courseId').equals(lesson.courseId).toArray(),
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

/**
 * Assign a fresh orderIndex to each lesson based on its position in
 * orderedLessonIds, in one transaction.
 */
export async function reorderLessons(_courseId: string, orderedLessonIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.lessons, async () => {
    await db.lessons.bulkUpdate(
      orderedLessonIds.map((id, orderIndex) => ({
        key: id,
        changes: stampUpdatedAt({ orderIndex }, now),
      })),
    );
  });
}

// ---------------------------------------------------------------------------
// Lesson-card links
// ---------------------------------------------------------------------------

/**
 * Link cards into a lesson for display/grouping purposes as one atomic operation.
 *
 * The read-before-write duplicate check is concurrency-safe without a compound unique
 * index: every caller opens a read-write IndexedDB transaction containing `lessonCards`,
 * and overlapping write transactions on that object store are serialised. A later caller
 * therefore cannot read until the earlier caller has committed its inserted links.
 */
export async function linkCardsToLesson(
  lessonId: string,
  cardIds: string[],
): Promise<LessonCardLink[]> {
  const uniqueCardIds = [...new Set(cardIds)];
  if (uniqueCardIds.length === 0) return [];

  try {
    return await db.transaction('rw', db.lessons, db.cards, db.lessonCards, async () => {
      const lesson = await db.lessons.get(lessonId);
      if (!lesson) throw new Error('The lesson could not be found.');

      const cards = await db.cards.bulkGet(uniqueCardIds);
      const missingIndex = cards.findIndex((card) => card === undefined);
      if (missingIndex !== -1) {
        throw new Error(`Card ${uniqueCardIds[missingIndex]} could not be found.`);
      }

      for (const card of cards as Card[]) {
        if (card.courseId !== lesson.courseId) {
          throw new Error('Cards can only be linked within the same course.');
        }
        if (card.primaryLessonId === lessonId) {
          throw new Error('A card already belonging to this lesson cannot also be linked to it.');
        }
      }

      const existing = await db.lessonCards.where('lessonId').equals(lessonId).toArray();
      const existingByCardId = new Map(existing.map((link) => [link.cardId, link]));
      const now = Date.now();
      const created = uniqueCardIds
        .filter((cardId) => !existingByCardId.has(cardId))
        .map((cardId) => stampUpdatedAt({ id: makeId(), lessonId, cardId, createdAt: now }, now));
      if (created.length > 0) await db.lessonCards.bulkAdd(created);
      for (const link of created) existingByCardId.set(link.cardId, link);
      return uniqueCardIds.map((cardId) => existingByCardId.get(cardId)!);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Idempotent single-card convenience wrapper around {@link linkCardsToLesson}. */
export async function linkCardToLesson(lessonId: string, cardId: string): Promise<LessonCardLink> {
  const [link] = await linkCardsToLesson(lessonId, [cardId]);
  return link;
}

/** Remove a display link and the teaching progress specific to that link. */
export async function unlinkCardFromLesson(lessonId: string, cardId: string): Promise<void> {
  await db.transaction('rw', db.lessonCards, db.lessonCardExposures, db.tombstones, async (tx) => {
    const links = await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((link) => link.cardId === cardId)
      .toArray();
    const exposure = await db.lessonCardExposures.get([lessonId, cardId]);
    await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((link) => link.cardId === cardId)
      .delete();
    await db.lessonCardExposures.delete([lessonId, cardId]);
    await recordTombstones(
      tx,
      'lessonCards',
      links.map((link) => link.id),
    );
    if (exposure) {
      await recordTombstone(tx, 'lessonCardExposures', lessonCardExposureId(lessonId, cardId));
    }
  });
}

// ---------------------------------------------------------------------------
// Lesson progress
// ---------------------------------------------------------------------------

export async function upsertLessonCardExposure(
  lessonId: string,
  cardId: string,
  taughtAt: number = Date.now(),
): Promise<LessonCardExposure> {
  // Serialise the read-then-add so concurrent callers cannot both observe no row
  // and collide on the second add's unique key.
  return db.transaction('rw', [db.lessonCardExposures], async () => {
    const existing = await db.lessonCardExposures.get([lessonId, cardId]);
    if (existing) return existing;
    const exposure = stampUpdatedAt({ lessonId, cardId, taughtAt }, taughtAt);
    await db.lessonCardExposures.add(exposure);
    return exposure;
  });
}

export async function markLessonComplete(
  lessonId: string,
  completedAt: number = Date.now(),
): Promise<LessonCompletion> {
  // As above: the read and the conditional add must run atomically.
  return db.transaction('rw', [db.lessonCompletions], async () => {
    const existing = await db.lessonCompletions.get(lessonId);
    if (existing) return existing;
    const completion = stampUpdatedAt({ lessonId, completedAt }, completedAt);
    await db.lessonCompletions.add(completion);
    return completion;
  });
}
