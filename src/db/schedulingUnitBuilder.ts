import type { CourseAssessment, CourseRecord, Lesson, SchedulingUnitRecord } from './types';

function assessmentDate(
  courseId: string,
  assessments: CourseAssessment[],
  fallbackExamDate: number,
): { examDate: number; timeZone?: string } {
  const final =
    assessments.find((assessment) => assessment.courseId === courseId && assessment.kind === 'final') ??
    assessments.find((assessment) => assessment.courseId === courseId);
  return final
    ? { examDate: final.examDate, ...(final.timeZone ? { timeZone: final.timeZone } : {}) }
    : { examDate: fallbackExamDate };
}

/** Build the target scheduling configuration for one Course. */
export function schedulingUnitFromCourse(
  course: CourseRecord,
  assessments: CourseAssessment[],
): SchedulingUnitRecord {
  const date = assessmentDate(course.id, assessments, course.createdAt);
  return {
    id: course.id,
    createdAt: course.createdAt,
    ...(course.examDatePromptDismissed !== undefined
      ? { examDatePromptDismissed: course.examDatePromptDismissed }
      : {}),
    kind: 'course',
    courseId: course.id,
    lessonId: null,
    name: course.name,
    examDate: date.examDate,
    ...(date.timeZone ? { timeZone: date.timeZone } : {}),
    fsrsVersion: course.fsrsVersion,
    fsrsParameters: course.fsrsParameters,
    examObjective: course.examObjective,
    ...(course.archived !== undefined ? { archived: course.archived } : {}),
    ...(course.newCardsPerDay !== undefined ? { newCardsPerDay: course.newCardsPerDay } : {}),
    ...(course.maxReviewsPerDay !== undefined ? { maxReviewsPerDay: course.maxReviewsPerDay } : {}),
    ...(course.leechThreshold !== undefined ? { leechThreshold: course.leechThreshold } : {}),
    ...(course.leechAction !== undefined ? { leechAction: course.leechAction } : {}),
    ...(course.autoOptimise !== undefined ? { autoOptimise: course.autoOptimise } : {}),
    ...(course.dailyReviewGoal !== undefined ? { dailyReviewGoal: course.dailyReviewGoal } : {}),
    ...(course.sessionTimeLimitMinutes !== undefined
      ? { sessionTimeLimitMinutes: course.sessionTimeLimitMinutes }
      : {}),
    ...(course.colour ? { colour: course.colour } : {}),
    ...(course.lastInteractedAt !== undefined ? { lastInteractedAt: course.lastInteractedAt } : {}),
  };
}

/** Build the target scheduling configuration for one Lesson, inheriting Course settings. */
export function schedulingUnitFromLesson(
  course: CourseRecord,
  lesson: Lesson,
  assessments: CourseAssessment[],
): SchedulingUnitRecord {
  const courseUnit = schedulingUnitFromCourse(course, assessments);
  return {
    ...courseUnit,
    id: lesson.id,
    createdAt: lesson.createdAt,
    kind: 'lesson',
    lessonId: lesson.id,
    name: lesson.name,
    examDate: lesson.examDate ?? courseUnit.examDate,
    ...(lesson.timeZone ?? courseUnit.timeZone
      ? { timeZone: lesson.timeZone ?? courseUnit.timeZone }
      : {}),
  };
}
