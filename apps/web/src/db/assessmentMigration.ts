import type {
  AssessmentDateCompatibility,
  Course,
  CourseAssessment,
  CourseRecord,
} from '@lacuna/core/db/types';

/** Intermediate assessment row retained by raw pre-migration snapshots. */
export type LegacyAssessmentRecord = AssessmentDateCompatibility;

/** Remove the final-assessment compatibility fields before persisting a course row. */
export function courseToRecord(course: Course): CourseRecord {
  const { examDate, timeZone, schedulingMode, ...record } = course;
  void examDate;
  void timeZone;
  void schedulingMode;
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
    schedulingMode: finalAssessment.schedulingMode ?? 'exam',
    ...(finalAssessment.examDate === undefined ? {} : { examDate: finalAssessment.examDate }),
    ...(finalAssessment.timeZone === undefined ? {} : { timeZone: finalAssessment.timeZone }),
  };
}
