import type {
  AssessmentDateCompatibility,
  Course,
  CourseAssessment,
  CourseRecord,
  Lesson,
} from './types';

/** Course row as stored before schema v14. */
export type LegacyCourseRecord = CourseRecord & {
  examDate: number;
  timeZone?: string;
};

/** Intermediate assessment row as stored in the retired v9-v13 table. */
export type LegacyAssessmentRecord = AssessmentDateCompatibility;

export interface CourseAssessmentMigrationResult {
  courses: CourseRecord[];
  assessments: CourseAssessment[];
}

/** Remove the final-assessment compatibility fields before persisting a course row. */
export function courseToRecord(course: Course): CourseRecord {
  const { examDate, timeZone, ...record } = course;
  void examDate;
  void timeZone;
  return record;
}

/** Return the single final assessment for a course, rejecting corrupt cardinality. */
export function finalAssessmentForCourse(
  courseId: string,
  assessments: CourseAssessment[],
): CourseAssessment {
  const finals = assessments.filter(
    (assessment) => assessment.courseId === courseId && assessment.kind === 'final',
  );
  if (finals.length !== 1) {
    throw new Error(
      `Course ${courseId} must have exactly one final assessment; found ${finals.length}.`,
    );
  }
  return finals[0];
}

/** Hydrate the temporary read-only Course date fields from its final assessment. */
export function hydrateCourse(record: CourseRecord, finalAssessment: CourseAssessment): Course {
  if (finalAssessment.courseId !== record.id || finalAssessment.kind !== 'final') {
    throw new Error(
      `Assessment ${finalAssessment.id} is not the final assessment for course ${record.id}.`,
    );
  }
  return {
    ...record,
    examDate: finalAssessment.examDate,
    ...(finalAssessment.timeZone === undefined ? {} : { timeZone: finalAssessment.timeZone }),
  };
}

function lastLessonId(lessons: Lesson[]): string | null {
  let last: Lesson | undefined;
  for (const lesson of lessons) {
    if (
      last === undefined ||
      lesson.orderIndex > last.orderIndex ||
      (lesson.orderIndex === last.orderIndex && lesson.createdAt > last.createdAt)
    ) {
      last = lesson;
    }
  }
  return last?.id ?? null;
}

function legacyAssessmentAnchor(
  assessment: LegacyAssessmentRecord,
  courseLessons: Lesson[],
): string | null {
  const lessonIds = assessment.lessonIds;
  if (lessonIds === undefined || lessonIds.length === 0) return lastLessonId(courseLessons);

  const scopedIds = new Set(lessonIds);
  const scopedLessons = courseLessons.filter((lesson) => scopedIds.has(lesson.id));
  // This mirrors the old path placement: a scope with no surviving references
  // fell back to the end rather than placing the checkpoint before all lessons.
  return scopedLessons.length > 0 ? lastLessonId(scopedLessons) : lastLessonId(courseLessons);
}

/**
 * Convert v13 course dates into the unified assessment representation. Existing
 * intermediate rows retain their ids; each course receives one generated final id.
 */
export function buildCourseAssessmentMigration(
  courses: LegacyCourseRecord[],
  lessons: Lesson[],
  legacyAssessments: LegacyAssessmentRecord[],
  generateId: () => string,
): CourseAssessmentMigrationResult {
  const lessonsByCourse = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const existing = lessonsByCourse.get(lesson.courseId);
    if (existing) existing.push(lesson);
    else lessonsByCourse.set(lesson.courseId, [lesson]);
  }

  const records = courses.map((course) => courseToRecord(course));
  const finals: CourseAssessment[] = courses.map((course) => ({
    id: generateId(),
    courseId: course.id,
    name: 'Final exam',
    kind: 'final',
    examDate: course.examDate,
    ...(course.timeZone === undefined ? {} : { timeZone: course.timeZone }),
    afterLessonId: lastLessonId(lessonsByCourse.get(course.id) ?? []),
    coverageMode: 'prefix',
    excludedCardIds: [],
    createdAt: course.createdAt,
  }));

  const checkpoints: CourseAssessment[] = legacyAssessments.map((assessment) => {
    const hasCustomCoverage = assessment.lessonIds !== undefined && assessment.lessonIds.length > 0;
    const common = {
      id: assessment.id,
      courseId: assessment.courseId,
      name: assessment.name,
      kind: 'checkpoint' as const,
      examDate: assessment.examDate,
      ...(assessment.timeZone === undefined ? {} : { timeZone: assessment.timeZone }),
      afterLessonId: legacyAssessmentAnchor(
        assessment,
        lessonsByCourse.get(assessment.courseId) ?? [],
      ),
      excludedCardIds: [...(assessment.excludedCardIds ?? [])],
      createdAt: assessment.createdAt,
    };
    return hasCustomCoverage
      ? { ...common, coverageMode: 'custom', lessonIds: [...assessment.lessonIds!] }
      : { ...common, coverageMode: 'prefix' };
  });

  return { courses: records, assessments: [...finals, ...checkpoints] };
}
