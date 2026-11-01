import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card } from '@lacuna/core/db/types';
import { rAtExamIfReviewedNow, type SimContext } from './forwardSim';

/** FSRS's reference retention; a model target, not a guarantee of human recall. */
export const ASSESSMENT_TARGET_RECALL = 0.9;

/** Reserve one day for preparation; imminent assessments make the card due now. */
export const ASSESSMENT_PREPARATION_LEAD_MS = MS_PER_DAY;

export interface AssessmentTiming {
  due: number | null;
  /** Predicted recall following an expected-grade review at due; absent without a future exam. */
  predictedRecall: number | null;
  /** Whether that projected review reaches the target; null without a future exam. */
  feasible: boolean | null;
}

/**
 * Preserve earlier ordinary reviews, including overdue dates, and cap later ones
 * at the preparation deadline. Exams less than one day away make reviews due now.
 * The lead is a preparation policy, not a promise of 90% recall: the existing
 * curve reports feasibility after an expected-grade review at max(now, due).
 * Projection does not change persisted memory.
 */
export function assessmentTiming(
  card: Card,
  now: number,
  examDate: number | undefined,
  ctx: SimContext,
): AssessmentTiming {
  if (examDate === undefined || !Number.isFinite(examDate) || examDate <= now) {
    return { due: card.due, predictedRecall: null, feasible: null };
  }
  const preparationDeadline = Math.max(now, examDate - ASSESSMENT_PREPARATION_LEAD_MS);
  const due = Math.min(card.due ?? Infinity, preparationDeadline);
  const predictedRecall = rAtExamIfReviewedNow(
    card,
    ctx.expectedGrade,
    examDate,
    Math.max(now, due),
    ctx,
  );
  return { due, predictedRecall, feasible: predictedRecall >= ASSESSMENT_TARGET_RECALL };
}
