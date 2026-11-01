import type { Course, RevisionPlan } from '@lacuna/core/db/types';
import { resolveSpecificationStudyScope } from '../../course/specificationStudyScope';
import {
  prepareCourseSessionPool,
  type CoursePoolRequest,
  type CourseSessionSource,
  type resolveCourseSessionSelection,
} from './sessionPool';

/** Optional point boundaries load with scoped Study, outside ordinary session startup. */
export function prepareSpecificationSessionPool(
  course: Course,
  source: CourseSessionSource,
  selection: ReturnType<typeof resolveCourseSessionSelection>,
  request: CoursePoolRequest & { requestSpecificationPointId: string },
  plan: RevisionPlan | null,
) {
  const prepared = prepareCourseSessionPool(course, source, selection, request, plan);
  const scoped = resolveSpecificationStudyScope({
    course,
    pointId: request.requestSpecificationPointId,
    cards: source.allCards,
    concepts: source.concepts,
    lessons: source.courseLessons,
    assessments: source.examDates,
    links: source.courseLinks,
    assessmentId: request.requestAssessmentId,
  });
  const ids = new Set(scoped?.cardIds ?? []);
  const extensions = new Set(
    source.courseLessons.filter((lesson) => lesson.isExtension).map((lesson) => lesson.id),
  );
  return {
    ...prepared,
    cards: prepared.cards.filter(
      (card) => ids.has(card.id) && !extensions.has(card.primaryLessonId ?? ''),
    ),
    scopeTitle: scoped?.title,
  };
}
