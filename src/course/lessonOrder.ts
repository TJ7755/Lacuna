import type { CourseRecord, CourseAssessment, Lesson, PracticeNode } from '../db/types';
import { lessonOrder } from './assessmentCoverage';

/** Presentation only: retain the original objects and their published indices. */
export function resolveLessonOrder(
  lessons: readonly Lesson[],
  preferredIds?: readonly string[],
): Lesson[] {
  const remaining = new Map([...lessons].sort(lessonOrder).map((lesson) => [lesson.id, lesson]));
  const ordered: Lesson[] = [];
  for (const id of preferredIds ?? []) {
    const lesson = remaining.get(id);
    if (lesson) {
      ordered.push(lesson);
      remaining.delete(id);
    }
  }
  return [...ordered, ...remaining.values()];
}

/** Unsupported sequencing must keep its publisher-defined obligations. */
export function localLessonOrderUnavailableReason(
  course: CourseRecord,
  lessons: readonly Lesson[],
  assessments: readonly CourseAssessment[],
  practiceNodes: readonly PracticeNode[],
): string | undefined {
  if (!course.distributedCopy?.locked)
    return 'Local lesson order requires a locked imported course.';
  if (course.archived) return 'Local lesson order is unavailable while this course is archived.';
  if (course.unlockMode !== 'open') return 'Local lesson order requires free progression.';
  if (course.autoPractice !== false)
    return 'Turn off automatic Card practice to use local lesson order.';
  if (practiceNodes.some((node) => node.type !== 'question-set')) {
    return 'Local lesson order is unavailable with Card practice nodes.';
  }
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  if (
    practiceNodes.some((node) => !node.questionSetIds?.length || !lessonIds.has(node.afterLessonId ?? ''))
  ) {
    return 'Local lesson order requires every practice activity to be a Question Set attached to a single lesson.';
  }
  if (
    assessments.length !== 1 ||
    assessments[0].kind !== 'final' ||
    assessments[0].afterLessonId !== null ||
    assessments[0].coverageMode !== 'prefix' ||
    assessments[0].excludedCardIds.length > 0 ||
    assessments[0].needsAuthorConfirmation
  ) {
    return 'Local lesson order requires one final assessment covering the whole course and no checkpoints.';
  }
  return undefined;
}

export function resolveCourseLessonOrder(
  course: CourseRecord,
  lessons: readonly Lesson[],
  assessments: readonly CourseAssessment[],
  practiceNodes: readonly PracticeNode[],
): Lesson[] {
  return resolveLessonOrder(
    lessons,
    localLessonOrderUnavailableReason(course, lessons, assessments, practiceNodes)
      ? undefined
      : course.localLessonOrder,
  );
}
