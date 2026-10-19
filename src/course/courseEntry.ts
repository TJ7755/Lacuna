import type { CourseRecord, CourseAssessment, Lesson, PracticeNode } from '../db/types';
import { lessonOrder } from './assessmentCoverage';
import { resolveCourseLessonOrder } from './lessonOrder';

/** Prior knowledge is an entry preference, never evidence of completion or mastery. */
export function earlierLessonIds(
  startLessonId: string | undefined,
  lessons: readonly Lesson[],
  orderedIds?: readonly string[],
): Set<string> {
  if (!startLessonId) return new Set();
  const start = lessons.find((lesson) => lesson.id === startLessonId && !lesson.isExtension);
  if (start && orderedIds) {
    const index = orderedIds.indexOf(start.id);
    return new Set(index < 0 ? [] : orderedIds.slice(0, index));
  }
  return new Set(
    start
      ? lessons.filter((lesson) => lessonOrder(lesson, start) < 0).map((lesson) => lesson.id)
      : [],
  );
}

export function earlierCourseLessonIds(
  course: CourseRecord,
  lessons: readonly Lesson[],
  assessments: readonly CourseAssessment[],
  practiceNodes: readonly PracticeNode[],
): Set<string> {
  if (!course.studyStartLessonId) return new Set();
  const ordered = resolveCourseLessonOrder(course, lessons, assessments, practiceNodes);
  return earlierLessonIds(course.studyStartLessonId, lessons, ordered.map((lesson) => lesson.id));
}
