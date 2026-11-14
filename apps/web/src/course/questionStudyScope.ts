import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  PracticeNode,
} from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';
import { pointsForSelection } from '@lacuna/core/specifications/selection';
import { currentAssessmentPracticeContext } from './assessmentPractice';
import { lessonCardMembershipForLessons, lessonCardMembership } from './lessonMembership';
import { lessonStatus } from './path';

/** Automatic questions use fully learned lessons, independently of editing permissions. */
export function questionStudyScope(input: {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  assessments: CourseAssessment[];
  practiceNodes: PracticeNode[];
  concepts: Concept[];
  completions?: readonly { lessonId: string }[];
}): string[] {
  const { course, lessons, cards, concepts } = input;
  if (course.archived) return [];
  const learned = new Set(questionStudyLessonScope(input));
  const known = new Set(
    lessonCardMembershipForLessons(learned, cards, input.links).map((card) => card.conceptId),
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

/**
 * Every member card must be learned, including linked cards. A partial exposure,
 * a school-coverage declaration or an empty completion receipt cannot stand in
 * for learning a lesson's cards. Direct FSRS courses use their existing non-new
 * card criterion; cardless lessons require explicit completion.
 */
export function questionStudyLessonScope(
  input: Parameters<typeof questionStudyScope>[0],
): string[] {
  if (input.course.archived) return [];
  const reached = currentAssessmentPracticeContext(input).reachedLessonIds;
  return input.lessons
    .filter((lesson) => {
      const members = lessonCardMembership(lesson.id, input.cards, input.links);
      if (members.length === 0)
        return (
          reached.has(lesson.id) &&
          Boolean(input.completions?.some((row) => row.lessonId === lesson.id))
        );
      return (
        lessonStatus(
          reached.has(lesson.id),
          lesson.id,
          members,
          input.exposures,
          [],
          input.course.learnFirst !== false,
        ) === 'completed'
      );
    })
    .map((lesson) => lesson.id);
}
