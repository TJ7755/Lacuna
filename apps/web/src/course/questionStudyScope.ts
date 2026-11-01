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
  const { course, lessons, cards, concepts } = input;
  if (course.archived) return [];
  const practice = currentAssessmentPracticeContext(input);
  const prior = earlierCourseLessonIds(course, lessons, input.assessments, input.practiceNodes);
  const priorReached = new Set([...prior].filter((id) => practice.reachedLessonIds.has(id)));
  const known = new Set(
    [...practice.scope, ...lessonCardMembershipForLessons(priorReached, cards, input.links)].map(
      (card) => card.conceptId,
    ),
  );
  if (course.unlockMode === 'open') {
    const cardConcepts = new Set(cards.map((card) => card.conceptId));
    const lessonMemberIds = new Set(
      lessonCardMembershipForLessons(
        new Set(lessons.map((lesson) => lesson.id)),
        cards,
        input.links,
      ).map((card) => card.id),
    );
    for (const card of cards) if (!lessonMemberIds.has(card.id)) known.add(card.conceptId);
    for (const concept of concepts) if (!cardConcepts.has(concept.id)) known.add(concept.id);
  }
  const data = course.specificationData;
  const points = data
    ? new Set(
        pointsForSelection(data, course.specificationRef ?? {}).map(
          (point) => `${data.id}:${point.id}`,
        ),
      )
    : undefined;
  return concepts
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
