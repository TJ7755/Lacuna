import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { QuestionScheduleState } from '@lacuna/core/questions/types';
import type { SimContext } from '../fsrs/forwardSim';
import { isUpcomingExamDate } from '../fsrs/examDate';
import { worthwhileAssessmentPractice } from '../fsrs/assessmentTiming';

export interface QuestionStudyTiming {
  now: number;
  examDate?: number;
  windowDays: number;
  ctx: SimContext;
  lastPracticeAt?: number;
  sittingStartedAt?: number;
  ordinaryDue?: boolean;
}

/** Automatic Study can stop while explicit manual practice remains available. */
export function questionStudyEligible(
  schedule: QuestionScheduleState,
  timing: QuestionStudyTiming,
): boolean {
  const { now, examDate, windowDays, ctx, lastPracticeAt, sittingStartedAt } = timing;
  if (
    sittingStartedAt !== undefined &&
    lastPracticeAt !== undefined &&
    lastPracticeAt >= sittingStartedAt
  )
    return false;
  const ordinaryDue = timing.ordinaryDue ?? (schedule.due === null || schedule.due <= now);
  if (ordinaryDue) return true;
  if (!isUpcomingExamDate(examDate, now) || examDate - now > windowDays * MS_PER_DAY) {
    return false;
  }
  return worthwhileAssessmentPractice(schedule, examDate, now, windowDays, ctx);
}
