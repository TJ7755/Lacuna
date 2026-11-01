import type { CourseProgressInput, CourseProgressReport } from './courseProgress';
import { buildCourseProgress } from './courseProgress';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { courseLessonOrderPreference } from './lessonOrder';
import { makeExamDateContext } from '../fsrs/examDate';
import { progressValue } from '../fsrs/objective';
import type { Concept } from '@lacuna/core/questions/types';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { buildQuestionEvidence, type QuestionEvidenceReport } from './questionEvidence';
import type { Specification, SpecificationSelection } from '@lacuna/core/specifications/catalogue';
import {
  paperPoints,
  papersForSelection,
  pointsForSelection,
} from '@lacuna/core/specifications/selection';
import { specificationAssessmentPointIds } from '../specifications/assessment';
import { unavailableSpecificationPointLinks } from '../specifications/tagResolver';

export interface SpecificationProgressFilter extends SpecificationSelection {
  paperId?: string;
}

export interface SpecificationPointProgress {
  id: string;
  ref: string;
  title: string;
  children: SpecificationPointProgress[];
  concepts: Concept[];
  contentCards: number;
  hasContent: boolean;
  countedCards: number;
  study: CourseProgressReport['study'];
  excludedCards: number;
  forecast: number | null;
  evidence: QuestionEvidenceReport;
  canPractise: boolean;
}

export type SpecificationProgressReport =
  | { kind: 'missing' | 'unresolved' }
  | {
      kind: 'ready';
      specification: Specification;
      roots: SpecificationPointProgress[];
      coveredPoints: number;
      totalPoints: number;
      unmappedConcepts: Concept[];
      unresolvedLinks: { concept: Concept; pointId: string }[];
    };

/** Coverage is authored content; forecasts use exactly the existing Progress pool and horizons. */
export function buildSpecificationProgress(
  input: CourseProgressInput,
  filter: SpecificationProgressFilter,
  practice: readonly ConceptPracticeItem[] = [],
): SpecificationProgressReport {
  const { course } = input;
  const spec = course.specificationData;
  const reference = course.specificationRef;
  if (!spec) return { kind: reference ? 'unresolved' : 'missing' };
  if (!reference || reference.specificationId !== spec.id) return { kind: 'unresolved' };
  const report = buildCourseProgress(input);
  const now = input.now ?? Date.now();
  const applicable = pointsForSelection(spec, filter);
  const paper = filter.paperId
    ? papersForSelection(spec, filter).find((row) => row.id === filter.paperId)
    : undefined;
  let selected = new Set(
    (filter.paperId ? (paper ? paperPoints(spec, paper, filter) : []) : applicable).map(
      (point) => `${spec.id}:${point.id}`,
    ),
  );
  if (report.assessment?.coverageMode === 'specification') {
    const assessmentPoints = new Set(specificationAssessmentPointIds(report.assessment, course));
    selected = new Set([...selected].filter((id) => assessmentPoints.has(id)));
  }
  const allPoints = new Map(spec.points.map((point) => [point.id, point]));
  // Keep ancestors as context even when a paper lists only its leaf points.
  const visible = new Set<string>();
  for (const qualified of selected) {
    let point = allPoints.get(qualified.slice(spec.id.length + 1));
    while (point && !visible.has(point.id)) {
      visible.add(point.id);
      point = point.parentId ? allPoints.get(point.parentId) : undefined;
    }
  }
  const courseConcepts = input.concepts.filter(
    (concept) => concept.scope === 'course' && concept.courseId === course.id,
  );
  const scopeCards = report.assessment
    ? resolveAssessmentCoverage(
        report.assessment,
        input.lessons,
        input.cards,
        input.links,
        courseLessonOrderPreference(course),
        { course, concepts: input.concepts },
      ).cards
    : input.cards.filter((card) => card.courseId === course.id);
  // Content remains linked even when every Card is excluded from the recall pool.
  const assessmentConcepts =
    report.assessment && report.assessment.coverageMode !== 'specification'
      ? new Set(scopeCards.map((card) => card.conceptId))
      : undefined;
  const concepts = courseConcepts.filter(
    (concept) => !assessmentConcepts || assessmentConcepts.has(concept.id),
  );
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const conceptIds = new Map(spec.points.map((point) => [point.id, new Set<string>()]));
  for (const concept of concepts) {
    for (const id of concept.specificationPointIds ?? []) {
      if (selected.has(id)) conceptIds.get(id.slice(spec.id.length + 1))?.add(concept.id);
    }
  }
  for (const point of [...spec.points].reverse()) {
    if (point.parentId)
      for (const id of conceptIds.get(point.id)!) conceptIds.get(point.parentId)!.add(id);
  }
  const cardsByConcept = new Map<string, typeof scopeCards>();
  for (const card of scopeCards) {
    const rows = cardsByConcept.get(card.conceptId) ?? [];
    rows.push(card);
    cardsByConcept.set(card.conceptId, rows);
  }
  const countedIds = new Set(report.cards.map((card) => card.id));
  const exposed = new Set(input.exposures.map((row) => row.cardId));
  const school = new Set(course.schoolCoveredLessonIds ?? []);
  const context = makeExamDateContext(course, input.lessons, input.assessments, input.links, [
    ...input.concepts,
  ]);
  const target =
    report.forecast.kind === 'assessment' ? { ...course, examDate: report.forecast.date } : course;
  const forecastable =
    report.forecast.kind === 'assessment' || report.forecast.kind === 'applicable';
  const cardValues = new Map(
    report.cards.map((card) => [
      card.id,
      progressValue(
        [card],
        target,
        now,
        report.forecast.kind === 'assessment' ? undefined : context,
      ),
    ]),
  );
  const currentPoints = new Set(
    pointsForSelection(spec, reference).map((point) => `${spec.id}:${point.id}`),
  );
  const rows = new Map<string, SpecificationPointProgress>();
  const availableQuestions = new Set(
    practice.filter((item) => item.availableCount > 0).map((item) => item.conceptId),
  );
  const sameSelection =
    filter.tier === reference.tier &&
    [...(filter.routeIds ?? [])].sort().join('\n') ===
      [...(reference.routeIds ?? [])].sort().join('\n');
  for (const point of spec.points) {
    if (!visible.has(point.id)) continue;
    const ids = conceptIds.get(point.id)!;
    const cards = [
      ...new Map(
        [...ids].flatMap((id) => cardsByConcept.get(id) ?? []).map((card) => [card.id, card]),
      ).values(),
    ];
    const counted = cards.filter((card) => countedIds.has(card.id));
    const reviewed = counted.filter((card) => card.lastReviewed !== null).length;
    const taughtNotReviewed = counted.filter(
      (card) =>
        card.lastReviewed === null &&
        (exposed.has(card.id) || school.has(card.primaryLessonId ?? '')),
    ).length;
    rows.set(point.id, {
      id: `${spec.id}:${point.id}`,
      ref: point.ref,
      title: point.title,
      children: [],
      concepts: [...ids].map((id) => byId.get(id)!),
      contentCards: cards.length,
      hasContent: cards.length > 0 || [...ids].some((id) => availableQuestions.has(id)),
      countedCards: counted.length,
      excludedCards: cards.length - counted.length,
      study: {
        reviewed,
        taughtNotReviewed,
        notStarted: counted.length - reviewed - taughtNotReviewed,
      },
      forecast:
        forecastable && counted.length
          ? counted.reduce((sum, card) => sum + cardValues.get(card.id)!, 0) / counted.length
          : null,
      evidence: buildQuestionEvidence(practice, [...ids]),
      canPractise:
        !course.archived &&
        sameSelection &&
        (!filter.paperId || filter.paperId === report.assessment?.specificationPaperId) &&
        ids.size > 0 &&
        currentPoints.has(`${spec.id}:${point.id}`),
    });
  }
  const roots: SpecificationPointProgress[] = [];
  for (const point of spec.points) {
    const row = rows.get(point.id);
    if (!row) continue;
    const parent = point.parentId ? rows.get(point.parentId) : undefined;
    if (parent) parent.children.push(row);
    else roots.push(row);
  }
  const parentIds = new Set(
    spec.points.flatMap((point) => (point.parentId ? [point.parentId] : [])),
  );
  const leaves = [...rows.values()].filter(
    (row) => selected.has(row.id) && !parentIds.has(row.id.slice(spec.id.length + 1)),
  );
  return {
    kind: 'ready',
    specification: spec,
    roots,
    totalPoints: leaves.length,
    coveredPoints: leaves.filter((row) => row.hasContent).length,
    unmappedConcepts: courseConcepts.filter((concept) => !concept.specificationPointIds?.length),
    unresolvedLinks: courseConcepts.flatMap((concept) =>
      unavailableSpecificationPointLinks(concept.specificationPointIds ?? [], spec, reference)
        .filter((link) => link.reason !== 'outside-selection')
        .map((link) => ({ concept, pointId: link.specificationPointId })),
    ),
  };
}
