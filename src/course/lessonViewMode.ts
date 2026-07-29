// Resolution logic for LessonView's study/edit mode, plus the single gate
// that decides whether edit mode is available at all. Every course carries
// its own explicit lessonViewMode (see Course.lessonViewMode, db/types.ts);
// the 'study' fallback here only covers courses that predate the field
// (e.g. an old backup restored later) — see the one-shot migration in App.tsx
// that stamps every existing course with the (now-removed) global default's
// last value on first run after this change.

import type { Course } from '../db/types';
import type { LessonViewMode } from '../state/lessonViewMode';

/**
 * Whether editing lessons (notes/cards CRUD) is available for this course at
 * all. Today there is no locked-course concept, so this always returns true —
 * but it is the ONE place that decision lives. Every call site that decides
 * whether edit mode is available (LessonView, settings toggles, anywhere
 * else) must go through this gate rather than reading lessonViewMode fields
 * directly, so that a future teacher/student locked-course sync only needs
 * to change this function's body.
 */
export function canEditLessons(course: Course): boolean {
  void course;
  return true;
}

/**
 * Resolve the effective study/edit mode for a course. Forced to 'study' when
 * canEditLessons() returns false, regardless of the course's own setting.
 * Falls back to 'study' for courses without an explicit lessonViewMode
 * (e.g. an old backup restored after this field became mandatory).
 */
export function resolveLessonViewMode(course: Course): LessonViewMode {
  if (!canEditLessons(course)) return 'study';
  return course.lessonViewMode ?? 'study';
}

/** Whether course-path lesson nodes should expose authoring and reordering controls. */
export function isLessonAuthoringMode(course: Course): boolean {
  return resolveLessonViewMode(course) === 'edit';
}
