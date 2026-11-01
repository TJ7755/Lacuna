import type { Card } from '@lacuna/core/db/types';
import { rAtExamIfReviewedNow, type SimContext } from './forwardSim';

/** FSRS's reference retention; a model target, not a guarantee of human recall. */
export const ASSESSMENT_TARGET_RECALL = 0.9;

export interface AssessmentTiming {
  due: number | null;
  /** Predicted recall following an expected-grade review at due; absent without a future exam. */
  predictedRecall: number | null;
  /** Whether that projected review reaches the target; null without a future exam. */
  feasible: boolean | null;
}

/**
 * Preserve earlier ordinary reviews and cap later ones at the last millisecond
 * before the assessment. The latest-time constraint collapses to this cap:
 * with positive post-review stability, recall tends to one as the review tends
 * to the exam. Millisecond resolution and tiny stability can still make 90%
 * infeasible. Report that honestly rather than moving to an invented midpoint.
 * Projection assumes ctx.expectedGrade and does not change persisted memory.
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
  const due = Math.min(card.due ?? Infinity, examDate - 1);
  const predictedRecall = rAtExamIfReviewedNow(
    card,
    ctx.expectedGrade,
    examDate,
    Math.max(now, due),
    ctx,
  );
  return { due, predictedRecall, feasible: predictedRecall >= ASSESSMENT_TARGET_RECALL };
}
