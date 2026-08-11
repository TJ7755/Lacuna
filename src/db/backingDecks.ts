// Hidden scheduling-deck adapter for the Course / Lesson domain.
//
// Courses and lessons are the application-facing model. The FSRS persistence layer
// still needs a Deck-shaped scheduling unit, so this module contains that bridge in
// one place. Legacy deck CRUD and import compatibility remain in repository.ts;
// course-facing callers should use these helpers rather than resolving backing decks
// themselves.

import type { Course, Deck } from './types';
import { db, makeId } from './schema';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { emptyPerformance } from '../fsrs/grading';
import { finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';

function ownedBackingDeck(
  courseId: string,
  lessonId: string | null,
): Promise<Deck | undefined> {
  return db.decks
    .filter(
      (deck) => deck.backingCourseId === courseId && (deck.backingLessonId ?? null) === lessonId,
    )
    .first();
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
export async function ensureLessonBackingDeck(courseId: string, lessonId: string): Promise<string> {
  const owned = await ownedBackingDeck(courseId, lessonId);
  if (owned) return owned.id;

  const existing = await db.cards.where('primaryLessonId').equals(lessonId).first();
  if (existing) {
    await db.decks.update(existing.deckId, {
      backingCourseId: courseId,
      backingLessonId: lessonId,
    });
    return existing.deckId;
  }

  const course = await courseWithAssessments(courseId);
  const lesson = await db.lessons.get(lessonId);
  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
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
  await db.decks.add(deck);
  await db.userPerformance.add(emptyPerformance(deck.id));
  return deck.id;
}

/** Resolve or create the hidden scheduling deck for unassigned course cards. */
export async function ensureCourseBankBackingDeck(courseId: string): Promise<string> {
  const owned = await ownedBackingDeck(courseId, null);
  if (owned) return owned.id;

  const existing = await db.cards
    .where('courseId')
    .equals(courseId)
    .filter((card) => card.primaryLessonId === null || card.primaryLessonId === undefined)
    .first();
  if (existing) {
    await db.decks.update(existing.deckId, {
      backingCourseId: courseId,
      backingLessonId: null,
    });
    return existing.deckId;
  }

  const course = await courseWithAssessments(courseId);
  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
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
  await db.decks.add(deck);
  await db.userPerformance.add(emptyPerformance(deck.id));
  return deck.id;
}
