// Resolution logic for LessonView's study/edit mode, plus the single gate
// that decides whether edit mode is available at all. See
// src/state/lessonViewMode.ts for the persisted global default and
// Course.lessonViewMode (src/db/types.ts) for the per-course override.

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
 * Resolve the effective study/edit mode for a course: the course's own
 * override if set, otherwise the global default. Forced to 'study' when
 * canEditLessons() returns false, regardless of either toggle.
 */
export function resolveLessonViewMode(
  course: Course,
  globalDefault: LessonViewMode,
): LessonViewMode {
  if (!canEditLessons(course)) return 'study';
  return course.lessonViewMode ?? globalDefault;
}
