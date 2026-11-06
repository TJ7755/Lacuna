import type { Card, Course } from '@lacuna/core/db/types';
import { MASTERY_R } from '@lacuna/core/fsrs/params';
import { isUpcomingExamDate, type ExamDateContext } from '../fsrs/examDate';
import { rAtExam } from '../fsrs/forwardSim';
import { decayOf } from '../fsrs/fsrs';
import { cardSchedulingHorizon } from '../fsrs/horizon';
import { resolveAssessmentCoverage } from './assessmentCoverage';

export interface StudyReadiness {
  totalCount: number;
  belowTargetCount: number;
  unintroducedCount: number;
  ready: boolean;
}

/**
 * Knowledge-card readiness from existing FSRS evidence, without assuming future
 * reviews. Session availability, introduction caps and the chosen starting lesson
 * cannot remove required material from this denominator. This is not evidence of
 * independent question mastery. Optional extensions count only when shared with
 * a core lesson or included by an upcoming assessment's resolved coverage.
 */
export function buildStudyReadiness({
  course,
  cards,
  examDateContext,
  now = Date.now(),
}: {
  course: Course;
  cards: Card[];
  examDateContext: ExamDateContext;
  now?: number;
}): StudyReadiness {
  const lessons = [...examDateContext.lessonsById.values()];
  const extensionIds = new Set(
    lessons.filter((lesson) => lesson.isExtension).map((lesson) => lesson.id),
  );
  const coreIds = new Set(
    lessons.filter((lesson) => !lesson.isExtension).map((lesson) => lesson.id),
  );
  const coreLinkedCardIds = new Set(
    (examDateContext.lessonCardLinks ?? [])
      .filter((link) => coreIds.has(link.lessonId))
      .map((link) => link.cardId),
  );
  const assessmentCardIds = new Set(
    examDateContext.courseAssessments
      .filter((assessment) => isUpcomingExamDate(assessment.examDate, now))
      .flatMap((assessment) =>
        resolveAssessmentCoverage(
          assessment,
          lessons,
          cards,
          examDateContext.lessonCardLinks ?? [],
          examDateContext.preferredLessonIds,
          examDateContext.specificationContext,
        ).cards.map((card) => card.id),
      ),
  );
  const scope = cards.filter(
    (card) =>
      card.courseId === course.id &&
      (!extensionIds.has(card.primaryLessonId ?? '') ||
        coreLinkedCardIds.has(card.id) ||
        assessmentCardIds.has(card.id)),
  );
  const decay = decayOf(course.fsrsParameters);
  let belowTargetCount = 0;
  let unintroducedCount = 0;
  for (const card of scope) {
    const unintroduced = card.state === 0 || card.lastReviewed === null;
    if (unintroduced) unintroducedCount++;
    const horizon = cardSchedulingHorizon(card, course, examDateContext, now);
    if (unintroduced || rAtExam(card, horizon, now, decay) < MASTERY_R) belowTargetCount++;
  }
  return {
    totalCount: scope.length,
    belowTargetCount,
    unintroducedCount,
    ready: scope.length > 0 && belowTargetCount === 0,
  };
}
