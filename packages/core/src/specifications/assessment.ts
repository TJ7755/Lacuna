import type { CourseAssessment, CourseRecord } from '@lacuna/core/db/types';
import { isSpecificationPointIds } from '@lacuna/core/specifications/links';
import {
  paperPoints,
  papersForSelection,
  pointsForSelection,
} from '@lacuna/core/specifications/selection';

export type AssessmentSpecificationCourse = Pick<
  CourseRecord,
  'specificationRef' | 'specificationData'
>;

/** Resolve authored coverage; never broaden an unresolved paper to the whole Course. */
export function specificationAssessmentPointIds(
  assessment: Pick<
    CourseAssessment,
    'coverageMode' | 'specificationPaperId' | 'specificationPointIds'
  >,
  course?: AssessmentSpecificationCourse,
): string[] {
  if (assessment.coverageMode !== 'specification') return [];
  const spec = course?.specificationData;
  const selection = course?.specificationRef;
  if (!spec || !selection || spec.id !== selection.specificationId) {
    throw new Error('Specification coverage requires matching Course specification data.');
  }
  if (spec.tiers.length && !spec.tiers.some((tier) => tier.id === selection.tier)) {
    throw new Error('Choose a valid specification tier before configuring papers.');
  }
  if (spec.routes.length && !selection.routeIds?.length) {
    throw new Error('Choose a specification route before configuring papers.');
  }
  const hasPaper = assessment.specificationPaperId !== undefined;
  const hasPoints = assessment.specificationPointIds !== undefined;
  if (hasPaper === hasPoints) {
    throw new Error('Specification coverage requires either one paper or explicit point ids.');
  }
  if (hasPaper) {
    const paper = papersForSelection(spec, selection).find(
      (candidate) => candidate.id === assessment.specificationPaperId,
    );
    if (!paper) throw new Error('The paper does not apply to this specification selection.');
    return paperPoints(spec, paper, selection).map((point) => `${spec.id}:${point.id}`);
  }
  const points = assessment.specificationPointIds;
  if (!isSpecificationPointIds(points) || points.length === 0) {
    throw new Error('Specification coverage requires non-empty, unique qualified point ids.');
  }
  const applicable = new Set(
    pointsForSelection(spec, selection).map((point) => `${spec.id}:${point.id}`),
  );
  if (points.some((point) => !applicable.has(point))) {
    throw new Error('A covered specification point does not apply to this Course selection.');
  }
  return points;
}

/** The last paper owns the existing final-exam lifecycle. */
export function validatePaperAssessmentDates(
  assessments: readonly Pick<
    CourseAssessment,
    'coverageMode' | 'kind' | 'examDate' | 'schedulingMode'
  >[],
): void {
  const papers = assessments.filter((assessment) => assessment.coverageMode === 'specification');
  if (papers.length === 0) return;
  const final = assessments.find((assessment) => assessment.kind === 'final');
  if (!final || final.examDate === undefined || final.schedulingMode === 'steady') {
    throw new Error('Dated papers require a dated final assessment for the last paper.');
  }
  if (papers.some((paper) => paper.examDate === undefined || paper.examDate > final.examDate!)) {
    throw new Error('The final assessment must be dated at or after every paper.');
  }
}

/** Refuse incompatible records after independent course and assessment merges. */
export function assertSpecificationAssessmentReferences(
  courses: readonly Pick<CourseRecord, 'id' | 'specificationRef' | 'specificationData'>[],
  assessments: readonly CourseAssessment[],
): void {
  const paperCourseIds = new Set<string>();
  for (const assessment of assessments) {
    if (assessment.coverageMode !== 'specification') continue;
    specificationAssessmentPointIds(
      assessment,
      courses.find((course) => course.id === assessment.courseId),
    );
    paperCourseIds.add(assessment.courseId);
  }
  for (const courseId of paperCourseIds) {
    validatePaperAssessmentDates(
      assessments.filter((assessment) => assessment.courseId === courseId),
    );
  }
}
