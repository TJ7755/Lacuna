import type { Card } from '@lacuna/core/db/types';
import { isUpcomingExamDate } from './examDate';
import { rAtExam, rAtExamIfReviewedNow, type SimContext } from './forwardSim';

/** FSRS's reference retention; a model target, not a guarantee of human recall. */
export const ASSESSMENT_TARGET_RECALL = 0.9;

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
  card: Card,
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
