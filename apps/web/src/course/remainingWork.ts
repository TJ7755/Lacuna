import type { Card, RevisionPlan } from '@lacuna/core/db/types';
import { isAvailable } from '../fsrs/eligibility';
import { isUpcomingExamDate } from '../fsrs/examDate';
import { revisionPlanDays } from './revisionPlan';
import { assessmentTiming } from '../fsrs/assessmentTiming';
import type { SimContext } from '../fsrs/forwardSim';

export interface RemainingWorkEstimate {
  overdue: number;
  dueBeforeAssessment: number;
  unstarted: number;
  minutes: number;
  dailyMinutes: number;
  coverage: number | null;
  budgetSource: 'plan' | 'observed' | 'unknown';
  usesDefaultTiming: boolean;
  recall: { mean: number; belowTarget: number; cards: number } | null;
}

/** Counts one currently known attempt per card, without simulating future reviews. */
export function estimateRemainingWork(
  sourceCards: readonly Card[],
  now: number,
  deadline: number,
  plan?: RevisionPlan,
  context?: SimContext,
): RemainingWorkEstimate | null {
  if (!Number.isFinite(deadline) || !isUpcomingExamDate(deadline, now)) return null;
  const cards = sourceCards.filter((card) => isAvailable(card, now));
  const reviews = cards
    .flatMap((card) => card.history)
    .filter(
      (review) =>
        review.timestamp <= now &&
        Number.isFinite(review.responseTimeSec) &&
        review.responseTimeSec > 0 &&
        !review.distracted,
    );
  const seconds = reviews.length
    ? reviews.reduce((sum, review) => sum + review.responseTimeSec, 0) / reviews.length
    : 30;
  const unstarted = cards.filter((card) => card.lastReviewed === null).length;
  const scheduled = cards.filter(
    (card) => card.lastReviewed !== null && card.due !== null && card.due < deadline,
  );
  const overdue = scheduled.filter((card) => card.due! <= now).length;
  const minutes = ((unstarted + scheduled.length) * seconds) / 60;
  const days = Math.max(1, Math.ceil((deadline - now) / 86_400_000));
  const remainingDays = new Set(revisionPlanDays(now, deadline, plan?.input.timeZone));
  const planBudget =
    plan?.status === 'active'
      ? plan.windows.reduce((sum, window) => {
          if (!remainingDays.has(window.day) || window.status === 'completed') return sum;
          const consumed =
            window.status === 'active' && window.startedAt !== undefined
              ? Math.max(0, now - window.startedAt) / 60_000
              : 0;
          return sum + Math.max(0, window.budgetMinutes - consumed);
        }, 0)
      : undefined;
  const recent = reviews.filter((review) => review.timestamp >= now - 14 * 86_400_000);
  const observed = recent.length
    ? recent.reduce((sum, review) => sum + review.responseTimeSec, 0) / 60 / 14
    : undefined;
  const capacity = planBudget ?? (observed === undefined ? undefined : days * observed);
  const predictions = context
    ? cards.map((card) => assessmentTiming(card, now, deadline, context))
    : [];
  return {
    recall: predictions.length
      ? {
          mean:
            predictions.reduce((sum, prediction) => sum + (prediction.predictedRecall ?? 0), 0) /
            predictions.length,
          belowTarget: predictions.filter((prediction) => prediction.feasible === false).length,
          cards: predictions.length,
        }
      : null,
    overdue,
    dueBeforeAssessment: scheduled.length - overdue,
    unstarted,
    minutes: Math.ceil(minutes),
    dailyMinutes: Math.ceil(minutes / days),
    coverage: capacity === undefined ? null : minutes === 0 ? 1 : Math.min(1, capacity / minutes),
    budgetSource:
      planBudget !== undefined ? 'plan' : observed !== undefined ? 'observed' : 'unknown',
    usesDefaultTiming: reviews.length === 0,
  };
}
