import type { CourseAssessment, CourseRecord } from '../db/types';
import type { Concept } from '../questions/types';
import { specificationAssessmentPointIds } from './assessment';
import { assertCourseSpecificationSelection } from './data';
import type { SpecificationReference } from './links';
import { unavailableSpecificationPointLinks } from './tagResolver';

/** Describe changes without mutating links or learner-owned assessments. */
export function previewSpecificationSelection(
  course: CourseRecord,
  selection: SpecificationReference,
  concepts: readonly Concept[],
  assessments: readonly CourseAssessment[],
) {
  const spec = course.specificationData;
  if (!spec) throw new Error('This course has no supplied specification metadata.');
  let selectionError: string | undefined;
  try {
    assertCourseSpecificationSelection(spec, selection);
    if (spec.tiers.length && !selection.tier) throw new Error('Choose a tier.');
    if (spec.routes.length && !selection.routeIds?.length) throw new Error('Choose a route.');
  } catch (cause) {
    selectionError = cause instanceof Error ? cause.message : 'Choose a supported selection.';
  }
  const unavailableLinks = concepts.flatMap((concept) =>
    unavailableSpecificationPointLinks(concept.specificationPointIds ?? [], spec, selection).map(
      (link) => ({ ...link, conceptId: concept.id, conceptName: concept.name }),
    ),
  );
  const paperCoverage = assessments
    .filter((assessment) => assessment.coverageMode === 'specification')
    .map((assessment) => {
      let before: string[] = [];
      // An unresolved old reference must not prevent previewing a repair.
      try {
        before = specificationAssessmentPointIds(assessment, course);
      } catch {
        // The proposed selection is validated below, using the same save contract.
      }
      try {
        const after = specificationAssessmentPointIds(assessment, {
          specificationData: spec,
          specificationRef: selection,
        });
        return {
          id: assessment.id,
          name: assessment.name,
          added: after.filter((id) => !before.includes(id)),
          removed: before.filter((id) => !after.includes(id)),
          error: undefined,
        };
      } catch (cause) {
        return {
          id: assessment.id,
          name: assessment.name,
          added: [],
          removed: before,
          error: cause instanceof Error ? cause.message : 'Paper coverage cannot be resolved.',
        };
      }
    });
  return { selectionError, unavailableLinks, paperCoverage };
}
