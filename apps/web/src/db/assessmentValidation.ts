import type { CourseAssessment } from './types';
import { isSpecificationPointIds } from '../specifications/links';

export function validateAssessmentStructure(assessment: CourseAssessment): void {
  if (assessment.kind !== 'final' && assessment.kind !== 'checkpoint') {
    throw new Error('Assessment kind must be final or checkpoint.');
  }
  if (
    assessment.afterLessonId !== null &&
    (typeof assessment.afterLessonId !== 'string' || assessment.afterLessonId.length === 0)
  ) {
    throw new Error('An assessment path position must be a lesson id or null.');
  }
  if (assessment.kind === 'checkpoint') {
    if (assessment.schedulingMode === 'steady') {
      throw new Error('Only the final assessment can use steady retention.');
    }
    if (!Number.isFinite(assessment.examDate)) {
      throw new Error('An assessment date must be a finite timestamp.');
    }
  } else if (assessment.schedulingMode === 'steady') {
    if (assessment.examDate !== undefined || assessment.timeZone !== undefined) {
      throw new Error('Steady retention cannot store an exam date or time zone.');
    }
  } else if (!Number.isFinite(assessment.examDate)) {
    throw new Error('An exam-targeted final assessment must have a finite timestamp.');
  }
  if (
    assessment.needsAuthorConfirmation !== undefined &&
    typeof assessment.needsAuthorConfirmation !== 'boolean'
  ) {
    throw new Error('Assessment author-confirmation state must be boolean.');
  }
  if (!Array.isArray(assessment.excludedCardIds)) {
    throw new Error('Assessment exclusions must be an explicit card-id array.');
  }
  if (
    assessment.excludedCardIds.some((cardId) => typeof cardId !== 'string' || cardId.length === 0)
  ) {
    throw new Error('Assessment exclusions must contain valid card ids.');
  }
  if (new Set(assessment.excludedCardIds).size !== assessment.excludedCardIds.length) {
    throw new Error('Assessment exclusions cannot contain duplicate card ids.');
  }
  if (
    assessment.coverageMode !== 'specification' &&
    (assessment.specificationPaperId !== undefined ||
      assessment.specificationPointIds !== undefined)
  ) {
    throw new Error('Only specification coverage can store paper or point ids.');
  }
  if (assessment.coverageMode === 'specification') {
    const hasPaper =
      typeof assessment.specificationPaperId === 'string' &&
      assessment.specificationPaperId.length > 0;
    const hasPoints =
      isSpecificationPointIds(assessment.specificationPointIds) &&
      assessment.specificationPointIds.length > 0;
    if (
      assessment.lessonIds !== undefined ||
      hasPaper === hasPoints ||
      (hasPaper && assessment.specificationPointIds !== undefined) ||
      (hasPoints && assessment.specificationPaperId !== undefined)
    ) {
      throw new Error('Specification coverage requires either one paper or explicit point ids.');
    }
    return;
  }
  if (assessment.coverageMode === 'prefix') {
    if (assessment.lessonIds !== undefined) {
      throw new Error('Prefix assessment coverage cannot store lesson ids.');
    }
    return;
  }
  if (assessment.coverageMode === 'custom') {
    if (!Array.isArray(assessment.lessonIds) || assessment.lessonIds.length === 0) {
      throw new Error('Custom assessment coverage requires an explicit lesson-id array.');
    }
    if (
      assessment.lessonIds.some((lessonId) => typeof lessonId !== 'string' || lessonId.length === 0)
    ) {
      throw new Error('Custom assessment coverage must contain valid lesson ids.');
    }
    if (new Set(assessment.lessonIds).size !== assessment.lessonIds.length) {
      throw new Error('Custom assessment coverage cannot contain duplicate lesson ids.');
    }
    return;
  }
  throw new Error('Assessment coverage mode must be prefix, custom or specification.');
}
