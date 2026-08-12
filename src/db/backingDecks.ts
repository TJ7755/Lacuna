// Hidden scheduling-deck adapter for the Course / Lesson domain.
//
// Courses and lessons are the application-facing model. The FSRS persistence layer
// still needs a Deck-shaped scheduling unit, so this module contains that bridge in
// one place. Legacy deck CRUD and import compatibility remain in repository.ts;
// course-facing callers should use these helpers rather than resolving backing decks
// themselves.

import type {
  Card,
  Course,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
  Deck,
  Lesson,
  SchedulingPerformance,
  UserPerformance,
} from './types';
import { db } from './schema';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { emptyPerformance, updatePerformance } from '../fsrs/grading';
import { finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';
import { schedulingUnitFromCourse, schedulingUnitFromLesson } from './schedulingUnitBuilder';

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
  if (!(await db.userPerformance.get(deckId))) {
    try {
      await db.userPerformance.add(emptyPerformance(deckId));
    } catch (error) {
      // Another context may have initialised the row between the read and add.
      // Never replace an existing calibration profile with an empty one.
      if (!isConstraintError(error)) throw error;
    }
  }

  const deck = await db.decks.get(deckId);
  if (!deck?.backingCourseId) return;
  const schedulingUnitId = deck.backingLessonId ?? deck.backingCourseId;
  if (await db.schedulingPerformance.get(schedulingUnitId)) return;
  await db.schedulingPerformance.put({
    schedulingUnitId,
    courseId: deck.backingCourseId,
    ...(deck.backingLessonId ? { lessonId: deck.backingLessonId } : {}),
    ...emptyPerformanceStats(),
  });
}

function emptyPerformanceStats() {
  return {
    runningMeanResponseTime: 0,
    runningStdDevResponseTime: 0,
    m2: 0,
    totalCorrectReviews: 0,
  };
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

function userPerformanceFromStats(
  unitId: string,
  stats: Pick<
    UserPerformance,
    'runningMeanResponseTime' | 'runningStdDevResponseTime' | 'm2' | 'totalCorrectReviews'
  >,
  courseId?: string,
): UserPerformance {
  return {
    deckId: unitId,
    ...(courseId ? { courseId } : {}),
    runningMeanResponseTime: stats.runningMeanResponseTime,
    runningStdDevResponseTime: stats.runningStdDevResponseTime,
    m2: stats.m2,
    totalCorrectReviews: stats.totalCorrectReviews,
  };
}

/** Load backing-unit pacing rows for Course workload estimates. */
export async function performanceForCourseBackingDecks(
  courseId: string,
  cards: Card[],
): Promise<UserPerformance[]> {
  const courseCards = cards.filter((card) => card.courseId === courseId);
  const deckIds = [...new Set(courseCards.map((card) => card.deckId))];
  if (deckIds.length === 0) return [];

  const [targetRows, legacyRows] = await Promise.all([
    db.schedulingPerformance.where('courseId').equals(courseId).toArray(),
    db.userPerformance.where('deckId').anyOf(deckIds).toArray(),
  ]);
  const targetByUnitId = new Map(targetRows.map((row) => [row.schedulingUnitId, row]));
  const legacyByDeckId = new Map(legacyRows.map((row) => [row.deckId, row]));
  const result: UserPerformance[] = [];
  for (const deckId of deckIds) {
    const card = courseCards.find((candidate) => candidate.deckId === deckId);
    const targetUnitId = card?.schedulingUnitId ?? deckId;
    const target = targetByUnitId.get(targetUnitId);
    const legacy = legacyByDeckId.get(deckId);
    if (target) {
      result.push(userPerformanceFromStats(deckId, target, target.courseId));
    } else if (legacy) {
      result.push(legacy);
    }
  }
  return result;
}

type ReviewPerformanceUnitKind = 'deck' | 'course';

/**
 * Load calibration rows for active review units. Course/Lesson sessions pass a Course id;
 * legacy deck sessions pass a Deck id. Course rows are read from the target store and the
 * legacy table remains a compatibility fallback while old databases are in the window.
 */
export function performanceForReviewUnits(
  unitIds: readonly string[],
  kind?: ReviewPerformanceUnitKind,
): Promise<Array<UserPerformance | undefined>> {
  return Promise.all(unitIds.map((unitId) => performanceForReviewUnit(unitId, kind)));
}

/**
 * Load calibration for an already-resolved review unit. The explicit kind prevents a
 * Course id and a legacy Deck id with the same string from sharing a calibration row.
 */
export async function performanceForReviewUnit(
  unitId: string,
  kind: ReviewPerformanceUnitKind = 'deck',
): Promise<UserPerformance | undefined> {
  if (kind === 'course') {
    const target = await db.coursePerformance.get(unitId);
    if (target) return userPerformanceFromStats(unitId, target, unitId);
    const compatibility = await db.userPerformance.get(unitId);
    return compatibility?.courseId === unitId ? compatibility : undefined;
  }
  return db.userPerformance.get(unitId);
}

/**
 * Update calibration for an already-resolved review unit. Course reviews write the target
 * Course store first and mirror the compatibility row; legacy Deck reviews keep their
 * existing key space until the compatibility route is retired.
 */
export async function updateReviewUnitPerformance(
  unitId: string,
  responseTimeSec: number,
  kind: ReviewPerformanceUnitKind = 'deck',
): Promise<UserPerformance> {
  const current = (await performanceForReviewUnit(unitId, kind)) ?? emptyPerformance(unitId);
  const next = updatePerformance(current, responseTimeSec);
  const compatibilityNext = kind === 'course' ? { ...next, courseId: unitId } : next;
  if (kind === 'course') {
    const target: CoursePerformance = {
      courseId: unitId,
      runningMeanResponseTime: next.runningMeanResponseTime,
      runningStdDevResponseTime: next.runningStdDevResponseTime,
      m2: next.m2,
      totalCorrectReviews: next.totalCorrectReviews,
    };
    await db.coursePerformance.put(target);
    await db.userPerformance.put(compatibilityNext);
  } else {
    await db.userPerformance.put(compatibilityNext);
  }
  return compatibilityNext;
}

/** Restore the exact pre-review calibration row for an already-resolved review unit. */
export async function restoreReviewUnitPerformance(
  unitId: string,
  previous: UserPerformance | null,
  kind: ReviewPerformanceUnitKind = 'deck',
): Promise<void> {
  if (kind === 'course') {
    if (previous) {
      await db.coursePerformance.put({
        courseId: unitId,
        runningMeanResponseTime: previous.runningMeanResponseTime,
        runningStdDevResponseTime: previous.runningStdDevResponseTime,
        m2: previous.m2,
        totalCorrectReviews: previous.totalCorrectReviews,
      });
      await db.userPerformance.put(previous);
    } else {
      await db.coursePerformance.delete(unitId);
      await db.userPerformance.delete(unitId);
    }
    return;
  }
  if (previous) {
    await db.userPerformance.put(previous);
  } else {
    await db.userPerformance.delete(unitId);
  }
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

/** Resolve all backing decks needed by a course question bank in one read pass. */
export async function findBackingDecks(
  courseId: string,
  lessonIds: readonly string[],
): Promise<Map<string | null, Deck>> {
  const lessonIdSet = new Set(lessonIds);
  const [owned, cards, links] = await Promise.all([
    db.decks
      .filter(
        (deck) =>
          deck.backingCourseId === courseId &&
          (deck.backingLessonId === null ||
            deck.backingLessonId === undefined ||
            lessonIdSet.has(deck.backingLessonId)),
      )
      .toArray(),
    db.cards.where('courseId').equals(courseId).toArray(),
    lessonIds.length > 0
      ? db.lessonCards.where('lessonId').anyOf([...lessonIds]).toArray()
      : [],
  ]);

  const result = new Map<string | null, Deck>();
  for (const deck of owned) {
    result.set(deck.backingLessonId ?? null, deck);
  }

  const deckIdsByScope = new Map<string | null, string>();
  for (const card of cards) {
    const scope =
      card.primaryLessonId !== null &&
      card.primaryLessonId !== undefined &&
      lessonIdSet.has(card.primaryLessonId)
        ? card.primaryLessonId
        : card.primaryLessonId === null || card.primaryLessonId === undefined
          ? null
          : undefined;
    if (scope !== undefined && !result.has(scope)) deckIdsByScope.set(scope, card.deckId);
  }

  for (const link of links) {
    if (result.has(link.lessonId) || deckIdsByScope.has(link.lessonId)) continue;
    const card = cards.find((candidate) => candidate.id === link.cardId);
    if (card && card.primaryLessonId !== link.lessonId) deckIdsByScope.set(link.lessonId, card.deckId);
  }

  const deckIds = [...new Set(deckIdsByScope.values())];
  const decks = deckIds.length > 0 ? await db.decks.bulkGet(deckIds) : [];
  for (const [scope, deckId] of deckIdsByScope) {
    const deck = decks[deckIds.indexOf(deckId)];
    if (deck) result.set(scope, deck);
  }
  return result;
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
/**
 * Project one Course and all its Lessons into target scheduling-unit storage.
 * Callers that are already in a Dexie transaction must include the source and target
 * tables in that transaction; this helper deliberately does not open a nested one.
 */
export async function syncCourseSchedulingUnits(courseId: string): Promise<void> {
  const [course, lessons, assessments] = await Promise.all([
    db.courses.get(courseId),
    db.lessons.where('courseId').equals(courseId).toArray(),
    db.courseAssessments.where('courseId').equals(courseId).toArray(),
  ]);
  if (!course) return;

  const courseUnit = schedulingUnitFromCourse(course as CourseRecord, assessments as CourseAssessment[]);
  const lessonUnits = lessons.map((lesson) =>
    schedulingUnitFromLesson(course as CourseRecord, lesson as Lesson, assessments as CourseAssessment[]),
  );
  await db.schedulingUnits.bulkPut([courseUnit, ...lessonUnits]);

  const existingCoursePerformance = await db.coursePerformance.get(courseId);
  if (!existingCoursePerformance) {
    await db.coursePerformance.put({ courseId, ...emptyPerformanceStats() });
  }
  const unitIds = [courseId, ...lessons.map((lesson) => lesson.id)];
  const existingSchedulingPerformance = await db.schedulingPerformance.bulkGet(unitIds);
  const missingSchedulingPerformance: SchedulingPerformance[] = [];
  if (!existingSchedulingPerformance[0]) {
    missingSchedulingPerformance.push({
      schedulingUnitId: courseId,
      courseId,
      ...emptyPerformanceStats(),
    });
  }
  lessons.forEach((lesson, index) => {
    if (existingSchedulingPerformance[index + 1]) return;
    missingSchedulingPerformance.push({
      schedulingUnitId: lesson.id,
      courseId,
      lessonId: lesson.id,
      ...emptyPerformanceStats(),
    });
  });
  if (missingSchedulingPerformance.length > 0) {
    await db.schedulingPerformance.bulkPut(missingSchedulingPerformance);
  }
}

/** Remove the target rows owned by one deleted Lesson. */
export async function removeLessonSchedulingUnit(lessonId: string): Promise<void> {
  await db.schedulingUnits.delete(lessonId);
  await db.schedulingPerformance.delete(lessonId);
}

/** Remove all target rows owned by one deleted Course, including its Lessons. */
export async function removeCourseSchedulingUnits(courseId: string, lessonIds: readonly string[]): Promise<void> {
  await db.schedulingUnits.bulkDelete([courseId, ...lessonIds]);
  await db.coursePerformance.delete(courseId);
  await db.schedulingPerformance.bulkDelete([courseId, ...lessonIds]);
}

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
