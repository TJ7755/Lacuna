// Hidden scheduling-deck adapter for the Course / Lesson domain.
//
// Courses and lessons are the application-facing model. The FSRS persistence layer
// still needs a Deck-shaped scheduling unit, so this module contains that bridge in
// one place. Legacy deck CRUD and import compatibility remain in repository.ts;
// course-facing callers should use these helpers rather than resolving backing decks
// themselves.

import type { Card, Course, Deck, UserPerformance } from './types';
import { db } from './schema';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { emptyPerformance } from '../fsrs/grading';
import { finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';

function ownedBackingDeck(courseId: string, lessonId: string | null): Promise<Deck | undefined> {
  return db.decks
    .filter(
      (deck) => deck.backingCourseId === courseId && (deck.backingLessonId ?? null) === lessonId,
    )
    .first();
}

// Serialise same-scope resolution within this runtime. The resolver is deliberately
// usable from existing Dexie transactions, so an in-memory lock avoids opening a
// nested transaction while still preventing concurrent callers from both creating
// a backing deck before either has committed it.
const backingDeckRequests = new Map<string, Promise<string>>();

function withBackingDeckLock(key: string, create: () => Promise<string>): Promise<string> {
  const inFlight = backingDeckRequests.get(key);
  if (inFlight) return inFlight;

  const request = create().finally(() => {
    if (backingDeckRequests.get(key) === request) backingDeckRequests.delete(key);
  });
  backingDeckRequests.set(key, request);
  return request;
}

/**
 * New backing decks use a deterministic id. The database's primary-key constraint
 * then prevents duplicate creation even when two browser contexts race; the second
 * writer can recover the already-committed deck below. Existing random ids remain
 * supported through the ownership and card fallbacks.
 */
function backingDeckId(courseId: string, lessonId: string | null): string {
  return `backing:${lessonId === null ? 'bank' : 'lesson'}:${courseId}:${lessonId ?? ''}`;
}

function isConstraintError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'ConstraintError') ||
    (error instanceof Error && error.name === 'ConstraintError')
  );
}

async function ensurePerformanceRow(deckId: string): Promise<void> {
  if (await db.userPerformance.get(deckId)) return;
  try {
    await db.userPerformance.add(emptyPerformance(deckId));
  } catch (error) {
    // Another context may have initialised the row between the read and add.
    // Never replace an existing calibration profile with an empty one.
    if (!isConstraintError(error)) throw error;
  }
}

async function addBackingDeck(deck: Deck): Promise<string> {
  try {
    await db.decks.add(deck);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    // A concurrent context may have won the deterministic primary-key race.
    // Re-read it and only swallow the error if it is the same backing scope.
    const existing = await db.decks.get(deck.id);
    if (
      !existing ||
      existing.backingCourseId !== deck.backingCourseId ||
      (existing.backingLessonId ?? null) !== (deck.backingLessonId ?? null)
    ) {
      throw error;
    }
  }
  await ensurePerformanceRow(deck.id);
  return deck.id;
}

async function adoptableDeck(
  deckId: string,
  courseId: string,
  lessonId: string | null,
): Promise<Deck | undefined> {
  const deck = await db.decks.get(deckId);
  if (!deck) return undefined;
  const ownedByScope =
    deck.backingCourseId === courseId && (deck.backingLessonId ?? null) === lessonId;
  const unowned = deck.backingCourseId === undefined && deck.backingLessonId === undefined;
  return ownedByScope || unowned ? deck : undefined;
}

/** Load backing-Deck calibration rows for Course pacing and workload estimates. */
export async function performanceForCourseBackingDecks(
  courseId: string,
  cards: Card[],
): Promise<UserPerformance[]> {
  const deckIds = [
    ...new Set(cards.filter((card) => card.courseId === courseId).map((card) => card.deckId)),
  ];
  return deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : [];
}

/**
 * Load calibration rows for active review units. Course/Lesson sessions pass a Course id;
 * legacy deck sessions pass a Deck id. The shared UserPerformance table keeps both keys,
 * so this adapter preserves that distinction without exposing the table to session code.
 */
export function performanceForReviewUnits(
  unitIds: readonly string[],
): Promise<Array<UserPerformance | undefined>> {
  return Promise.all(unitIds.map((unitId) => db.userPerformance.get(unitId)));
}

export async function findBackingDeck(
  courseId: string,
  lessonId: string | null,
): Promise<Deck | undefined> {
  const owned = await ownedBackingDeck(courseId, lessonId);
  if (owned) return owned;

  const card =
    lessonId !== null
      ? await db.cards
          .where('primaryLessonId')
          .equals(lessonId)
          .filter((candidate) => candidate.courseId === courseId)
          .first()
      : await db.cards
          .where('courseId')
          .equals(courseId)
          .filter(
            (candidate) =>
              candidate.primaryLessonId === null || candidate.primaryLessonId === undefined,
          )
          .first();
  if (card) return db.decks.get(card.deckId);

  if (lessonId !== null) {
    const link = await db.lessonCards.where('lessonId').equals(lessonId).first();
    if (link) {
      const linkedCard = await db.cards.get(link.cardId);
      if (linkedCard?.courseId === courseId) return db.decks.get(linkedCard.deckId);
    }
  }
  return undefined;
}

async function courseWithAssessments(courseId: string): Promise<Course | undefined> {
  const [record, assessments] = await Promise.all([
    db.courses.get(courseId),
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
  ]);
  if (!record) return undefined;
  return hydrateCourse(record, finalAssessmentForCourse(courseId, assessments));
}

/**
 * Resolve or create the hidden scheduling deck for one lesson.
 *
 * This intentionally remains a plain table-operation helper: callers may invoke it
 * from an existing Dexie transaction, so opening a nested transaction here would
 * make course imports and generated-card regeneration harder to compose safely.
 */
export function ensureLessonBackingDeck(courseId: string, lessonId: string): Promise<string> {
  return withBackingDeckLock(`lesson:${courseId}:${lessonId}`, async () => {
    const owned = await ownedBackingDeck(courseId, lessonId);
    if (owned) {
      await ensurePerformanceRow(owned.id);
      return owned.id;
    }

    const existing = await db.cards
      .where('primaryLessonId')
      .equals(lessonId)
      .filter((card) => card.courseId === courseId)
      .first();
    if (existing) {
      const existingDeck = await adoptableDeck(existing.deckId, courseId, lessonId);
      if (existingDeck) {
        if (existingDeck.backingCourseId === undefined) {
          await db.decks.update(existing.deckId, {
            backingCourseId: courseId,
            backingLessonId: lessonId,
          });
        }
        await ensurePerformanceRow(existing.deckId);
        return existing.deckId;
      }
    }

    const course = await courseWithAssessments(courseId);
    const lesson = await db.lessons.get(lessonId);
    const createdAt = Date.now();
    const deck: Deck = {
      id: backingDeckId(courseId, lessonId),
      name: lesson?.name ?? 'Untitled lesson',
      examDate: course?.examDate ?? defaultExamDate(createdAt),
      timeZone: course?.timeZone ?? getLocalTimeZone(),
      createdAt,
      fsrsVersion: course?.fsrsVersion ?? FSRS_VERSION,
      fsrsParameters: course?.fsrsParameters ?? defaultFsrsParameters(),
      examObjective: course?.examObjective ?? 'expectedMarks',
      lastInteractedAt: createdAt,
      backingCourseId: courseId,
      backingLessonId: lessonId,
      ...(course?.colour ? { colour: course.colour } : {}),
    };
    return addBackingDeck(deck);
  });
}

/** Resolve or create the hidden scheduling deck for unassigned course cards. */
export function ensureCourseBankBackingDeck(courseId: string): Promise<string> {
  return withBackingDeckLock(`bank:${courseId}`, async () => {
    const owned = await ownedBackingDeck(courseId, null);
    if (owned) {
      await ensurePerformanceRow(owned.id);
      return owned.id;
    }

    const existing = await db.cards
      .where('courseId')
      .equals(courseId)
      .filter((card) => card.primaryLessonId === null || card.primaryLessonId === undefined)
      .first();
    if (existing) {
      const existingDeck = await adoptableDeck(existing.deckId, courseId, null);
      if (existingDeck) {
        if (existingDeck.backingCourseId === undefined) {
          await db.decks.update(existing.deckId, {
            backingCourseId: courseId,
            backingLessonId: null,
          });
        }
        await ensurePerformanceRow(existing.deckId);
        return existing.deckId;
      }
    }

    const course = await courseWithAssessments(courseId);
    const createdAt = Date.now();
    const deck: Deck = {
      id: backingDeckId(courseId, null),
      name: course ? `${course.name} — Question bank` : 'Question bank',
      examDate: course?.examDate ?? defaultExamDate(createdAt),
      timeZone: course?.timeZone ?? getLocalTimeZone(),
      createdAt,
      fsrsVersion: course?.fsrsVersion ?? FSRS_VERSION,
      fsrsParameters: course?.fsrsParameters ?? defaultFsrsParameters(),
      examObjective: course?.examObjective ?? 'expectedMarks',
      lastInteractedAt: createdAt,
      backingCourseId: courseId,
      backingLessonId: null,
      ...(course?.colour ? { colour: course.colour } : {}),
    };
    return addBackingDeck(deck);
  });
}
