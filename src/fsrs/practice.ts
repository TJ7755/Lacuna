// Auto-practice insertion for the Course model.
//
// A course's path interleaves lessons (curriculum-paced) with practice sessions
// (forgetting-curve-paced). This module decides whether a practice node should be
// auto-inserted in the current gap, from the volume of due work and how close the
// exam is. It is pure: no DB access and no Date.now() except as a default.
//
// The rule (new_features_list.md Addendum 2 §H): estimate the minutes it would
// take to clear the due cards (count x mean review time), and trigger practice
// once that crosses a threshold. The threshold tightens only when an urgent
// assessment intersects the caller's current Practice scope. A
// maximum-gap backstop forces a session if too many lessons have passed without
// one, so a course whose due-count never crosses the threshold still gets
// periodic practice.

import { daysUntil } from '../utils/datetime';
import type { Course } from '../db/types';

/**
 * Whether to auto-insert a practice node now.
 *
 * @param course                    the course being paced.
 * @param dueCardCount              number of due cards across the course's pool.
 * @param lessonsSinceLastPractice  lessons elapsed since the last practice node.
 * @param meanReviewSeconds         mean seconds per review (from the course's
 *   calibration; the caller derives it, so no stale value is stored on the course).
 * @param nearestAssessmentDate     nearest urgent, useful assessment intersecting
 *   this Practice scope; omitted when no such assessment exists.
 */
export function shouldInsertPractice(
  course: Course,
  dueCardCount: number,
  lessonsSinceLastPractice: number,
  meanReviewSeconds: number,
  now: number = Date.now(),
  nearestAssessmentDate?: number,
): boolean {
  const minutesToClear = (dueCardCount * meanReviewSeconds) / 60;
  const threshold =
    nearestAssessmentDate !== undefined &&
    daysUntil(nearestAssessmentDate, now) <= course.practiceUrgentWindowDays
      ? course.practiceThresholdMinutesNear
      : course.practiceThresholdMinutesFar;

  if (minutesToClear >= threshold) return true;
  // Backstop: never let too many lessons pass without a practice session.
  if (lessonsSinceLastPractice >= course.practiceMaxGap) return true;
  return false;
}
