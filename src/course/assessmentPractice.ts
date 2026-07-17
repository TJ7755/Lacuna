import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
} from '../db/types';
import { isAvailable } from '../fsrs/eligibility';
import { rAtExam } from '../fsrs/forwardSim';
import { decayOf } from '../fsrs/fsrs';
import { MASTERY_R } from '../fsrs/params';
import { daysUntil } from '../utils/datetime';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { isLessonUnlocked, lessonEffectiveReleaseDates } from './path';
import { lessonCardMembershipForLessons, practiceCardScope } from './studyPools';

export interface AssessmentPracticeOption {
  assessmentId: string;
  name: string;
  examDate: number;
  eligibleCount: number;
}

export interface AssessmentPracticeContext {
  course: Course;
  assessments: CourseAssessment[];
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  reachedLessonIds: ReadonlySet<string>;
  now?: number;
}

/** Current automatic/recurring Practice scope and its urgent assessment choices. */
export function currentAssessmentPracticeContext(
  context: Omit<AssessmentPracticeContext, 'reachedLessonIds'>,
): {
  reachedLessonIds: ReadonlySet<string>;
  scope: Card[];
  assessmentOptions: AssessmentPracticeOption[];
} {
  const now = context.now ?? Date.now();
  const effectiveDates = lessonEffectiveReleaseDates(context.course, context.lessons);
  const reachedLessonIds = new Set(
    context.lessons
      .filter((lesson) =>
        isLessonUnlocked(context.course, lesson, effectiveDates, context.lessons, now),
      )
      .map((lesson) => lesson.id),
  );
  const scope = practiceCardScope(
    context.cards,
    context.links,
    context.exposures,
    { reachedLessonIds },
    now,
    context.course.leechThreshold,
  );
  return {
    reachedLessonIds,
    scope,
    assessmentOptions: assessmentPracticeOptions({ ...context, reachedLessonIds, now }, scope),
  };
}

/** Ordinary Practice cards for one selected assessment and no other horizon. */
export function assessmentPracticePool(
  assessment: CourseAssessment,
  context: Omit<AssessmentPracticeContext, 'assessments' | 'course'> & { course: Course },
): Card[] {
  const now = context.now ?? Date.now();
  if (context.course.archived || assessment.examDate <= now) return [];
  const reachedAndExposed = practiceCardScope(
    context.cards,
    context.links,
    context.exposures,
    { reachedLessonIds: context.reachedLessonIds },
    now,
    context.course.leechThreshold,
  );
  const resolved = resolveAssessmentCoverage(
    assessment,
    context.lessons,
    context.cards,
    context.links,
  );
  const reachedCoveredLessonIds = new Set(
    resolved.coveredLessons
      .filter((lesson) => context.reachedLessonIds.has(lesson.id))
      .map((lesson) => lesson.id),
  );
  const excludedCardIds = new Set(assessment.excludedCardIds);
  const assessmentCardIds = new Set(
    lessonCardMembershipForLessons(reachedCoveredLessonIds, context.cards, context.links)
      .filter((card) => card.courseId === assessment.courseId && !excludedCardIds.has(card.id))
      .map((card) => card.id),
  );
  const decay = decayOf(context.course.fsrsParameters);
  return reachedAndExposed.filter(
    (card) =>
      assessmentCardIds.has(card.id) &&
      isAvailable(card, now) &&
      rAtExam(card, assessment.examDate, now, decay) < MASTERY_R,
  );
}

/** Future assessments intersecting this exact Practice context, ordered by date. */
export function assessmentPracticeOptions(
  context: AssessmentPracticeContext,
  triggerScope: readonly Card[],
  urgentOnly = true,
): AssessmentPracticeOption[] {
  const now = context.now ?? Date.now();
  const triggerCardIds = new Set(triggerScope.map((card) => card.id));
  return context.assessments
    .filter((assessment) => assessment.examDate > now)
    .sort(
      (left, right) =>
        left.examDate - right.examDate ||
        left.createdAt - right.createdAt ||
        left.id.localeCompare(right.id),
    )
    .flatMap((assessment) => {
      if (
        urgentOnly &&
        daysUntil(assessment.examDate, now) > context.course.practiceUrgentWindowDays
      ) {
        return [];
      }
      const resolved = resolveAssessmentCoverage(
        assessment,
        context.lessons,
        context.cards,
        context.links,
      );
      if (!resolved.cards.some((card) => triggerCardIds.has(card.id))) return [];
      const eligibleCount = assessmentPracticePool(assessment, context).length;
      return eligibleCount > 0
        ? [
            {
              assessmentId: assessment.id,
              name: assessment.name,
              examDate: assessment.examDate,
              eligibleCount,
            },
          ]
        : [];
    });
}
