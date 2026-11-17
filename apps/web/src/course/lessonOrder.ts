import type { CourseRecord, CourseAssessment, Lesson, PracticeNode } from '@lacuna/core/db/types';

import { resolveLessonOrder } from '@lacuna/core/course/lessonOrder';

/** Only active locked imports support a learner-owned order. */
export function localLessonOrderUnavailableReason(
  course: CourseRecord,
  _lessons: readonly Lesson[],
  _assessments: readonly CourseAssessment[],
  _practiceNodes: readonly PracticeNode[],
): string | undefined {
  if (!course.distributedCopy?.locked)
    return 'Local lesson order requires a locked imported course.';
  if (course.archived) return 'Local lesson order is unavailable while this course is archived.';
  return undefined;
}

export function resolveCourseLessonOrder(
  course: CourseRecord,
  lessons: readonly Lesson[],
  _assessments: readonly CourseAssessment[],
  _practiceNodes: readonly PracticeNode[],
): Lesson[] {
  return resolveLessonOrder(
    lessons,
    localLessonOrderUnavailableReason(course, lessons, _assessments, _practiceNodes)
      ? undefined
      : course.localLessonOrder,
  );
}
