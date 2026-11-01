import type { CourseRecord, CourseAssessment, Lesson, PracticeNode } from '@lacuna/core/db/types';
import { lessonOrder } from './assessmentCoverage';
import { resolveCourseLessonOrder } from './lessonOrder';

/** Prior knowledge is an entry preference, never evidence of completion or mastery. */
export function earlierLessonIds(
  startLessonId: string | undefined,
  lessons: readonly Lesson[],
  orderedIds?: readonly string[],
  coveredIds?: readonly string[],
): Set<string> {
  const core = lessons.filter((lesson) => !lesson.isExtension);
  if (coveredIds !== undefined) {
    const currentIds = new Set(core.map((lesson) => lesson.id));
    return new Set(coveredIds.filter((id) => currentIds.has(id)));
  }
  if (!startLessonId) return new Set();
  const start = core.find((lesson) => lesson.id === startLessonId);
  if (start && orderedIds) {
    const index = orderedIds.indexOf(start.id);
    const coreIds = new Set(core.map((lesson) => lesson.id));
    return new Set(index < 0 ? [] : orderedIds.slice(0, index).filter((id) => coreIds.has(id)));
  }
  return new Set(
    start ? core.filter((lesson) => lessonOrder(lesson, start) < 0).map((lesson) => lesson.id) : [],
  );
}

export function earlierCourseLessonIds(
  course: CourseRecord,
  lessons: readonly Lesson[],
  assessments: readonly CourseAssessment[],
  practiceNodes: readonly PracticeNode[],
): Set<string> {
  const ordered = resolveCourseLessonOrder(course, lessons, assessments, practiceNodes);
  return earlierLessonIds(
    course.studyStartLessonId,
    lessons,
    ordered.map((lesson) => lesson.id),
    course.schoolCoveredLessonIds,
  );
}
