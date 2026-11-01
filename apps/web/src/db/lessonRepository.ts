import { assertLessonPrerequisites } from './lessonPrerequisites';
import { syncCourseSchedulingUnits } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { earlierLessonIds } from '../course/courseEntry';
import {
  lessonCardExposureId,
  recordTombstone,
  recordTombstones,
  stampUpdatedAt,
} from './mutationStamp';
import { db, makeId } from './schema';
import type { Card, Lesson, LessonCardExposure, LessonCardLink, LessonCompletion } from './types';

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function createLesson(
  courseId: string,
  name: string,
  opts?: Partial<Lesson>,
): Promise<Lesson> {
  try {
    return await db.transaction(
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
        assertLessonPrerequisites([...existing, lesson]);
        await db.lessons.add(lesson);
        await syncCourseSchedulingUnits(courseId);
        return lesson;
      },
    );
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
        const existing = await db.lessons.get(id);
        if (existing) {
          if (changes.id !== undefined && changes.id !== id) {
            throw new Error('Lesson identity cannot change.');
          }
          if (changes.courseId !== undefined && changes.courseId !== existing.courseId) {
            throw new Error('A Lesson cannot move between Courses.');
          }
          const lessons = await db.lessons.where('courseId').equals(existing.courseId).toArray();
          assertLessonPrerequisites(
            lessons.map((lesson) => (lesson.id === id ? { ...lesson, ...changes } : lesson)),
          );
        }
        await db.lessons.update(id, stampUpdatedAt(changes));
        const lesson = await db.lessons.get(id);
        if (lesson) await syncCourseSchedulingUnits(lesson.courseId);
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
 * Assign a fresh orderIndex to each lesson based on its position in
 * orderedLessonIds, in one transaction.
 */
export async function reorderLessons(courseId: string, orderedLessonIds: string[]): Promise<void> {
  const { validateLessonPermutation } = await import('./lessonOrder');
  const now = Date.now();
  await db.transaction('rw', [db.courses, db.lessons], async () => {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('Course not found.');
    if (course.distributedCopy?.locked) throw new Error('Published lesson order is locked.');
    const lessons = await db.lessons.where('courseId').equals(courseId).toArray();
    validateLessonPermutation(lessons, orderedLessonIds);
    if (course.schoolCoveredLessonIds === undefined && course.studyStartLessonId) {
      await db.courses.update(
        courseId,
        stampUpdatedAt(
          {
            schoolCoveredLessonIds: [...earlierLessonIds(course.studyStartLessonId, lessons)],
          },
          Math.max(now, course.updatedAt + 1),
        ),
      );
    }
    await db.lessons.bulkUpdate(
      orderedLessonIds.map((id, orderIndex) => ({
        key: id,
        changes: stampUpdatedAt({ orderIndex }, now),
      })),
    );
  });
}

/** Save only the local Course preference; reset is also allowed while suspended. */
export async function setLocalLessonOrder(courseId: string, ids?: string[]): Promise<void> {
  const { setLocalLessonOrder } = await import('./lessonOrder');
  return setLocalLessonOrder(courseId, ids);
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

export { snapshotLesson, restoreLesson, deleteLesson } from './lessonDeletion';
export type { LessonSnapshot } from './lessonDeletion';
