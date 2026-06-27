// Per-card exam-date resolution for the Course model.
//
// In the Course model a single card can be aimed at several possible exam dates:
// a lesson-level override, one or more course checkpoints (CourseExamDate rows),
// or the course's primary exam date. This module resolves, for one card, the
// single effective date the scheduler should target. It is pure: no DB access and
// no Date.now() except as a default parameter.
//
// Resolution order (new_features_list.md §8.2 and Addendum 2 §G):
//   1. Lesson override: if the card's primary lesson has an `examDate`, use it.
//      This is an explicit teacher override and wins outright, regardless of
//      whether it is in the past or the future, and even if a sooner checkpoint
//      exists. (Override beats "nearest".)
//   2. Nearest applicable future checkpoint: among the course's CourseExamDate
//      rows that apply to this card, pick the soonest whose date is still in the
//      future (>= now). Once a checkpoint passes it is ignored, so the next-nearest
//      checkpoint (or the course default) naturally takes over. (Here we use
//      nearest-future-applicable, NOT a fixed priority.)
//   3. Otherwise: the course's primary `examDate`.

import type { Card, Course, Lesson, CourseExamDate } from '../db/types';

export interface ExamDateContext {
  /** The Course.examDate default, used when nothing nearer applies. */
  courseExamDate: number;
  /** Lessons keyed by id, for the lesson-level examDate override lookup. */
  lessonsById: Map<string, Lesson>;
  /** Checkpoints / extra exam dates for the course. */
  courseExamDates: CourseExamDate[];
}

/** Build a resolution context once for a course, reused across its cards. */
export function makeExamDateContext(
  course: Course,
  lessons: Lesson[],
  examDates: CourseExamDate[],
): ExamDateContext {
  return {
    courseExamDate: course.examDate,
    lessonsById: new Map(lessons.map((l) => [l.id, l])),
    courseExamDates: examDates,
  };
}

/** Whether a checkpoint applies to a card: in-scope lesson and not excluded. */
function checkpointApplies(examDate: CourseExamDate, card: Card): boolean {
  if (examDate.excludedCardIds?.includes(card.id)) return false;
  if (examDate.lessonIds === undefined) return true;
  // A card with no primary lesson cannot match a lesson-scoped checkpoint.
  if (card.primaryLessonId === null || card.primaryLessonId === undefined) {
    return false;
  }
  return examDate.lessonIds.includes(card.primaryLessonId);
}

/**
 * Resolve the effective target exam date for a single card. See the file header
 * for the full resolution order; in short: lesson override wins outright, else the
 * nearest applicable future checkpoint, else the course's primary exam date.
 */
export function resolveCardExamDate(
  card: Card,
  ctx: ExamDateContext,
  now: number = Date.now(),
): number {
  // 1. Lesson override wins outright (past or future).
  if (card.primaryLessonId !== null && card.primaryLessonId !== undefined) {
    const lesson = ctx.lessonsById.get(card.primaryLessonId);
    if (lesson?.examDate !== undefined) return lesson.examDate;
  }

  // 2. Nearest applicable future checkpoint.
  let nearest: number | undefined;
  for (const examDate of ctx.courseExamDates) {
    if (examDate.examDate < now) continue;
    if (!checkpointApplies(examDate, card)) continue;
    if (nearest === undefined || examDate.examDate < nearest) {
      nearest = examDate.examDate;
    }
  }
  if (nearest !== undefined) return nearest;

  // 3. Course default.
  return ctx.courseExamDate;
}
