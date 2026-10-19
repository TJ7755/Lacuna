// Shared header-stat maths for CourseHeader consumers (CoursePath, LessonView):
// the nearest exam date and its urgency flag, plus the one definition of "due"
// that every due count and Review due cards session share. Pure — same
// convention as path.ts, no database access.
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

import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
} from '../db/types';
import { dueReviewPool } from './studyPools';
import { nearestExamDate, examIsUrgent } from './path';

export interface CourseHeaderStats {
  nearestExam?: number;
  examUrgent: boolean;
  mastery: number;
}

/** Bundles the exam and mastery stats every course/lesson header renders. */
export function courseHeaderStats(
  course: Course,
  assessments: CourseAssessment[],
  mastery: number,
  now: number = Date.now(),
): CourseHeaderStats {
  const nearestExam = nearestExamDate(course, assessments, now);
  return { nearestExam, examUrgent: examIsUrgent(nearestExam, now), mastery };
}

export interface CourseDueReviewInput {
  course: Course;
  lessons: Lesson[];
  assessments: CourseAssessment[];
  /** Cards to count: the whole course, or one lesson's members. */
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  now?: number;
}

/**
 * The cards a Review due cards session serves. Scheduled reviews remain available
 * regardless of lesson introductions, lesson locks or predicted exam readiness.
 */
export function courseDueReviewCards({
  course,
  cards,
  now = Date.now(),
}: CourseDueReviewInput): Card[] {
  return dueReviewPool(cards, course, now);
}
