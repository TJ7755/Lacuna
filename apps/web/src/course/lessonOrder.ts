import type { CourseRecord, CourseAssessment, Lesson, PracticeNode } from '../db/types';

/** Canonical publisher order, including deterministic ties. */
export function lessonOrder(left: Lesson, right: Lesson): number {
  return (
    left.orderIndex - right.orderIndex ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

export function courseLessonOrderPreference(course: CourseRecord): readonly string[] | undefined {
  return course.distributedCopy?.locked && !course.archived ? course.localLessonOrder : undefined;
}

/** Retain the published objects and indices while applying a learner preference. */
export function resolveLessonOrder(
  lessons: readonly Lesson[],
  preferredIds?: readonly string[],
): Lesson[] {
  const published = new Map([...lessons].sort(lessonOrder).map((lesson) => [lesson.id, lesson]));
  const preferred = new Set(preferredIds);
  const additions = new Map<string | undefined, Lesson[]>();
  let predecessor: string | undefined;
  for (const lesson of published.values()) {
    if (preferred.has(lesson.id)) {
      predecessor = lesson.id;
    } else {
      const group = additions.get(predecessor) ?? [];
      group.push(lesson);
      additions.set(predecessor, group);
    }
  }
  const ordered = [...(additions.get(undefined) ?? [])];
  for (const id of preferred) {
    const lesson = published.get(id);
    if (lesson) ordered.push(lesson, ...(additions.get(id) ?? []));
  }
  return ordered;
}

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
