import type { Card, Course, CourseAssessment, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import { pointsForSelection } from '@lacuna/core/specifications/selection';
import { specificationAssessmentPointIds } from '../specifications/assessment';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { courseLessonOrderPreference } from './lessonOrder';

/** Qualified ids for an applicable point and its applicable descendants, in document order. */
function specificationPointBranch(course: Course, pointId: string): string[] {
  const data = course.specificationData;
  const selection = course.specificationRef;
  if (!data || !selection || data.id !== selection.specificationId) return [];
  const points = pointsForSelection(data, selection);
  const selected = points.find((point) => `${data.id}:${point.id}` === pointId);
  if (!selected) return [];
  const branch = new Set([selected.id]);
  for (const point of points) {
    if (point.parentId && branch.has(point.parentId)) branch.add(point.id);
  }
  return [...branch].map((id) => `${data.id}:${id}`);
}

export interface SpecificationStudyScope {
  title: string;
  conceptIds: string[];
  cardIds: string[];
}

/** Resolve authored scope only. Ordinary Study eligibility still decides what can be served. */
export function resolveSpecificationStudyScope(input: {
  course: Course;
  pointId: string;
  concepts: readonly Concept[];
  cards: Card[];
  lessons: Lesson[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  assessmentId?: string;
}): SpecificationStudyScope | null {
  const { course } = input;
  if (course.archived) return null;
  let branch = new Set(specificationPointBranch(course, input.pointId));
  if (!branch.size) return null;
  const assessment =
    input.assessmentId !== undefined
      ? input.assessments.find((row) => row.id === input.assessmentId && row.courseId === course.id)
      : undefined;
  if (input.assessmentId !== undefined && !assessment) return null;
  let coverage = input.cards;
  try {
    if (assessment) {
      const resolved = resolveAssessmentCoverage(
        assessment,
        input.lessons,
        input.cards,
        input.links,
        courseLessonOrderPreference(course),
        { course, concepts: input.concepts },
      );
      if (!resolved.validation.valid) return null;
      coverage = resolved.cards;
      if (assessment.coverageMode === 'specification') {
        const assessmentPoints = new Set(specificationAssessmentPointIds(assessment, course));
        branch = new Set([...branch].filter((id) => assessmentPoints.has(id)));
      }
    }
  } catch {
    return null;
  }
  const concepts = input.concepts.filter(
    (concept) =>
      concept.scope === 'course' &&
      concept.courseId === course.id &&
      concept.specificationPointIds?.some((id) => branch.has(id)),
  );
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const cards = coverage.filter(
    (card) => card.courseId === course.id && conceptIds.has(card.conceptId),
  );
  const coveredConcepts = new Set(cards.map((card) => card.conceptId));
  const point = course.specificationData!.points.find(
    (candidate) => `${course.specificationData!.id}:${candidate.id}` === input.pointId,
  )!;
  return {
    title: `${point.ref} ${point.title}`,
    conceptIds: concepts
      .filter(
        (concept) =>
          !assessment ||
          assessment.coverageMode === 'specification' ||
          coveredConcepts.has(concept.id),
      )
      .map((concept) => concept.id),
    cardIds: [...new Set(cards.map((card) => card.id))],
  };
}
