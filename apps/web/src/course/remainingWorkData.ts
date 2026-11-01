import type { CourseAssessment, RevisionPlan } from '@lacuna/core/db/types';
import { cardsWithReviewHistory } from '@lacuna/core/db/reviewHistory';
import type { useCoursePathRecords } from '../state/useCourseStudyFlowRecords';
import { listReviewHistoryForCourse } from '../db/reviewHistoryRead';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { courseLessonOrderPreference } from './lessonOrder';
import { isUpcomingExamDate } from '../fsrs/examDate';
import { simContext } from '../fsrs/forwardSim';
import { makeEngine } from '../fsrs/fsrs';
import { estimateRemainingWork, type RemainingWorkEstimate } from './remainingWork';

export type RemainingWorkRecords = Pick<
  NonNullable<ReturnType<typeof useCoursePathRecords>>,
  'course' | 'assessments' | 'lessons' | 'cards' | 'links' | 'concepts'
>;
export interface RemainingWorkInput {
  source: RemainingWorkRecords;
  plans: RevisionPlan[];
}
export type RemainingWorkResults = {
  assessment: CourseAssessment;
  estimate: RemainingWorkEstimate;
}[];

export async function calculateRemainingWork(
  input: RemainingWorkInput,
  now: number,
  hydrate: boolean,
): Promise<RemainingWorkResults> {
  const { course, assessments, lessons, links, concepts } = input.source;
  if (!course) return [];
  const cards = hydrate
    ? cardsWithReviewHistory(
        input.source.cards,
        await listReviewHistoryForCourse(course.id, input.source.cards),
      )
    : input.source.cards;
  const context = simContext(course, makeEngine(course.fsrsParameters));
  return assessments
    .filter((assessment) => isUpcomingExamDate(assessment.examDate, now))
    .sort((a, b) => a.examDate! - b.examDate!)
    .flatMap((assessment) => {
      const coverage = resolveAssessmentCoverage(
        assessment,
        lessons,
        cards,
        links,
        courseLessonOrderPreference(course),
        { course, concepts },
      );
      if (!coverage.validation.valid) return [];
      const estimate = estimateRemainingWork(
        coverage.cards,
        now,
        assessment.examDate!,
        input.plans.find((plan) => plan.assessmentId === assessment.id && plan.status === 'active'),
        context,
      );
      return estimate ? [{ assessment, estimate }] : [];
    });
}
