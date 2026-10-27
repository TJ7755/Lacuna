import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  PracticeNode,
} from '../db/types';
import type { Concept } from '../questions/types';
import { pointsForSelection } from '../specifications/selection';
import { currentAssessmentPracticeContext } from './assessmentPractice';
import { earlierCourseLessonIds } from './courseEntry';
import { lessonCardMembershipForLessons } from './lessonMembership';

/** Question candidates use accessible knowledge scope, independently of publisher editing permissions. */
export function questionStudyScope(input: {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  assessments: CourseAssessment[];
  practiceNodes: PracticeNode[];
  concepts: Concept[];
}): string[] {
  if (input.course.archived) return [];
  const practice = currentAssessmentPracticeContext(input);
  const prior = earlierCourseLessonIds(
    input.course,
    input.lessons,
    input.assessments,
    input.practiceNodes,
  );
  const priorReached = new Set([...prior].filter((id) => practice.reachedLessonIds.has(id)));
  const known = new Set(
    [
      ...practice.scope,
      ...lessonCardMembershipForLessons(priorReached, input.cards, input.links),
    ].map((card) => card.conceptId),
  );
  if (input.course.unlockMode === 'open') {
    const cardConcepts = new Set(input.cards.map((card) => card.conceptId));
    const lessonMemberIds = new Set(
      lessonCardMembershipForLessons(
        new Set(input.lessons.map((lesson) => lesson.id)),
        input.cards,
        input.links,
      ).map((card) => card.id),
    );
    for (const card of input.cards) if (!lessonMemberIds.has(card.id)) known.add(card.conceptId);
    for (const concept of input.concepts) if (!cardConcepts.has(concept.id)) known.add(concept.id);
  }
  const data = input.course.specificationData;
  const points = data
    ? new Set(
        pointsForSelection(data, input.course.specificationRef ?? {}).map((point) => point.id),
      )
    : undefined;
  return input.concepts
    .filter(
      (concept) =>
        concept.scope === 'course' &&
        known.has(concept.id) &&
        (!points ||
          !concept.specificationPointIds?.length ||
          concept.specificationPointIds.some((id) => points.has(id))),
    )
    .map((concept) => concept.id);
}
