import type { CourseAssessment, CourseRecord, LineageIdMapping } from '@lacuna/core/db/types';

/** Publisher snapshots remain ownership evidence even if their ID list needs recovery. */
export function isLearnerOwnedCheckpoint(
  course: CourseRecord | null | undefined,
  assessment: CourseAssessment,
  mapping: LineageIdMapping | null | undefined,
): boolean {
  return (
    !!course?.distributedCopy?.locked &&
    !course.archived &&
    assessment.courseId === course.id &&
    assessment.kind === 'checkpoint' &&
    mapping?.id === course.distributedCopy.lineageId &&
    mapping.courseId === course.id &&
    !mapping.assessmentIds?.includes(assessment.id) &&
    !Object.prototype.hasOwnProperty.call(mapping.assessmentSnapshots ?? {}, assessment.id)
  );
}
