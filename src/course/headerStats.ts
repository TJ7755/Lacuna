// Shared header-stat maths for CourseHeader consumers (CoursePath, LessonView):
// the nearest exam date, its urgency flag, and the due-card count for a given
// card scope. Pure — same convention as path.ts, no database access.
//
// Mastery is deliberately NOT computed here: CoursePath derives it from the
// course-level CourseSummary (which excludes extension-lesson cards, see
// computeCourseSummaries in useCourseData.ts), while LessonView derives it
// directly from progressValue on the lesson's own cards. These are different
// scopes with different inputs, so this helper takes the already-computed
// mastery value as a parameter and simply bundles it alongside the stats that
// genuinely are identical maths at both scopes.
//
// British English throughout.

import type { Card, Course, CourseExamDate } from '../db/types';
import { dueCards } from '../fsrs/eligibility';
import { nearestExamDate, examIsUrgent } from './path';

export interface CourseHeaderStats {
  nearestExam: number;
  examUrgent: boolean;
  mastery: number;
  dueCardCount: number;
}

/**
 * Bundles the four stats every course/lesson header renders. `cards` is the
 * card set to derive `dueCardCount` from — course-wide cards for CoursePath,
 * a single lesson's cards for LessonView.
 */
export function courseHeaderStats(
  course: Course,
  examDates: CourseExamDate[],
  cards: Card[],
  mastery: number,
  now: number = Date.now(),
): CourseHeaderStats {
  const nearestExam = nearestExamDate(course, examDates, now);
  return {
    nearestExam,
    examUrgent: examIsUrgent(nearestExam, now),
    mastery,
    dueCardCount: dueCards(cards, now).length,
  };
}
