import { MASTERY_R, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { SchedulingMemory } from './fsrs';
import { isUpcomingExamDate } from './examDate';
import { rAtExam, rAtExamIfReviewedNow, type SimContext } from './forwardSim';

/** FSRS's reference retention; a model target, not a guarantee of human recall. */
export const ASSESSMENT_TARGET_RECALL = MASTERY_R;

export interface AssessmentTiming {
  due: number | null;
  /** Exam recall, including one expected-grade review only if due falls before the exam. */
  predictedRecall: number | null;
  /** Whether projected exam recall reaches the target; null without a future exam. */
  feasible: boolean | null;
}

/**
 * Informational only: preserve the ordinary FSRS due date exactly.
 * Project one expected-grade review at max(now, due) only when due is before
 * the assessment. Otherwise use current memory without inventing a review after
 * the exam. The 90% reference target is a model prediction, not a guarantee.
 */
export function assessmentTiming(
  card: SchedulingMemory,
  now: number,
  examDate: number | undefined,
  ctx: SimContext,
): AssessmentTiming {
  if (!isUpcomingExamDate(examDate, now) || !Number.isFinite(examDate)) {
    return { due: card.due, predictedRecall: null, feasible: null };
  }
  const due = card.due;
  const reviewAt = due === null ? undefined : Math.max(now, due);
  const predictedRecall =
    reviewAt !== undefined && reviewAt < examDate
      ? rAtExamIfReviewedNow(card, ctx.expectedGrade, examDate, reviewAt, ctx)
      : rAtExam(card, examDate, now, ctx.decay);
  return { due, predictedRecall, feasible: predictedRecall >= ASSESSMENT_TARGET_RECALL };
}

/** Current memory only: do not assume a future scheduled review has happened. */
function assessmentRecallBelowTarget(
  card: SchedulingMemory,
  examDate: number,
  now: number,
  ctx: SimContext,
): boolean {
  return isUpcomingExamDate(examDate, now) && rAtExam(card, examDate, now, ctx.decay) < MASTERY_R;
}

export function assessmentReviewGain(
  card: SchedulingMemory,
  examDate: number,
  now: number,
  ctx: SimContext,
): number {
  return (
    rAtExamIfReviewedNow(card, ctx.expectedGrade, examDate, now, ctx) -
    rAtExam(card, examDate, now, ctx.decay)
  );
}

/**
 * Kept exported: narrowing changes compiled output without behavioural benefit.
 * @public
 */
export const MIN_ASSESSMENT_REVIEW_GAIN = 0.01;

export function worthwhileAssessmentPractice(
  card: SchedulingMemory,
  examDate: number,
  now: number,
  windowDays: number,
  ctx: SimContext,
): boolean {
  if (card.due !== null && card.due <= now) return true;
  return (
    assessmentRecallBelowTarget(card, examDate, now, ctx) &&
    examDate - now <= windowDays * MS_PER_DAY &&
    (card.lastReviewed === null || now - card.lastReviewed >= MS_PER_DAY / 24) &&
    assessmentReviewGain(card, examDate, now, ctx) >= MIN_ASSESSMENT_REVIEW_GAIN
  );
}
