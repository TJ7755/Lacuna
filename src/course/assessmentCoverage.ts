import type { Card, CourseAssessment, Lesson, LessonCardLink } from '../db/types';
import { lessonCardMembershipForLessons } from './studyPools';

export type AssessmentValidationCode =
  | 'missing-placement-lesson'
  | 'cross-course-placement-lesson'
  | 'empty-custom-coverage'
  | 'duplicate-custom-lesson'
  | 'missing-covered-lesson'
  | 'cross-course-covered-lesson'
  | 'custom-lesson-after-assessment'
  | 'missing-excluded-card'
  | 'cross-course-excluded-card'
  | 'excluded-card-not-covered';

export interface AssessmentValidationIssue {
  code: AssessmentValidationCode;
  referenceId?: string;
  message: string;
}

export interface ResolvedAssessmentCoverage {
  placementIndex: number;
  coveredLessons: Lesson[];
  cards: Card[];
  validation: {
    valid: boolean;
    needsAuthorConfirmation: boolean;
    issues: AssessmentValidationIssue[];
  };
}

function lessonOrder(left: Lesson, right: Lesson): number {
  return (
    left.orderIndex - right.orderIndex ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

/** Pure, authoritative resolution of an assessment's placement, lessons and cards. */
export function resolveAssessmentCoverage(
  assessment: CourseAssessment,
  lessons: Lesson[],
  cards: Card[],
  links: LessonCardLink[],
): ResolvedAssessmentCoverage {
  const issues: AssessmentValidationIssue[] = [];
  const orderedLessons = lessons
    .filter((lesson) => lesson.courseId === assessment.courseId)
    .sort(lessonOrder);
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  let placementIndex = -1;
  if (assessment.afterLessonId !== null) {
    const anchor = lessonsById.get(assessment.afterLessonId);
    if (!anchor) {
      issues.push({
        code: 'missing-placement-lesson',
        referenceId: assessment.afterLessonId,
        message: `Assessment placement lesson ${assessment.afterLessonId} could not be found.`,
      });
    } else if (anchor.courseId !== assessment.courseId) {
      issues.push({
        code: 'cross-course-placement-lesson',
        referenceId: anchor.id,
        message: `Assessment placement lesson ${anchor.id} belongs to another course.`,
      });
    } else {
      placementIndex = orderedLessons.findIndex((lesson) => lesson.id === anchor.id);
    }
  }

  // A final assessment with no explicit anchor is placed after the last lesson (it
  // covers everything taught so far), matching legacy migration semantics and the
  // editor copy. A checkpoint with no anchor legitimately means "before all lessons",
  // so this only applies to finals.
  if (assessment.kind === 'final' && assessment.afterLessonId === null) {
    placementIndex = orderedLessons.length - 1;
  }

  let coveredLessons: Lesson[];
  if (assessment.coverageMode === 'prefix') {
    coveredLessons = orderedLessons.slice(0, placementIndex + 1);
  } else {
    if (assessment.lessonIds.length === 0) {
      issues.push({
        code: 'empty-custom-coverage',
        message: 'Custom assessment coverage must contain at least one lesson.',
      });
    }
    const seen = new Set<string>();
    coveredLessons = [];
    for (const lessonId of assessment.lessonIds) {
      if (seen.has(lessonId)) {
        issues.push({
          code: 'duplicate-custom-lesson',
          referenceId: lessonId,
          message: `Custom assessment coverage contains lesson ${lessonId} more than once.`,
        });
        continue;
      }
      seen.add(lessonId);
      const lesson = lessonsById.get(lessonId);
      if (!lesson) {
        issues.push({
          code: 'missing-covered-lesson',
          referenceId: lessonId,
          message: `Covered lesson ${lessonId} could not be found.`,
        });
      } else if (lesson.courseId !== assessment.courseId) {
        issues.push({
          code: 'cross-course-covered-lesson',
          referenceId: lessonId,
          message: `Covered lesson ${lessonId} belongs to another course.`,
        });
      } else {
        const lessonIndex = orderedLessons.findIndex((candidate) => candidate.id === lessonId);
        if (lessonIndex > placementIndex) {
          issues.push({
            code: 'custom-lesson-after-assessment',
            referenceId: lessonId,
            message: `Covered lesson ${lessonId} is positioned after the assessment.`,
          });
        }
        coveredLessons.push(lesson);
      }
    }
    coveredLessons.sort(lessonOrder);
  }

  const coveredLessonIds = new Set(coveredLessons.map((lesson) => lesson.id));
  const coveredCards = lessonCardMembershipForLessons(coveredLessonIds, cards, links).filter(
    (card) => card.courseId === assessment.courseId,
  );
  const coveredCardIds = new Set(coveredCards.map((card) => card.id));
  for (const cardId of assessment.excludedCardIds) {
    const card = cardsById.get(cardId);
    if (!card) {
      issues.push({
        code: 'missing-excluded-card',
        referenceId: cardId,
        message: `Excluded card ${cardId} could not be found.`,
      });
    } else if (card.courseId !== assessment.courseId) {
      issues.push({
        code: 'cross-course-excluded-card',
        referenceId: cardId,
        message: `Excluded card ${cardId} belongs to another course.`,
      });
    } else if (!coveredCardIds.has(cardId)) {
      issues.push({
        code: 'excluded-card-not-covered',
        referenceId: cardId,
        message: `Excluded card ${cardId} is not covered by the assessment.`,
      });
    }
  }

  const excludedIds = new Set(assessment.excludedCardIds);
  return {
    placementIndex,
    coveredLessons,
    cards: coveredCards.filter((card) => !excludedIds.has(card.id)),
    validation: {
      valid: issues.length === 0,
      needsAuthorConfirmation:
        assessment.needsAuthorConfirmation === true ||
        issues.some((issue) =>
          [
            'missing-placement-lesson',
            'cross-course-placement-lesson',
            'missing-covered-lesson',
            'cross-course-covered-lesson',
            'missing-excluded-card',
            'cross-course-excluded-card',
          ].includes(issue.code),
        ),
      issues,
    },
  };
}
