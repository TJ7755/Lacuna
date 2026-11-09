// Preview only the next block. Later work is selected from fresh evidence after it finishes.

import type { Card } from '@lacuna/core/db/types';
import type { StudyFlowDecision, StudyFlowStep } from './studyFlowPlanner';
import { countOf } from '../utils/plural';

/** Allow time for a first exposure, recall and a retry. */
const NEW_CARD_REVIEW_EQUIVALENTS = 3;
export const CARD_PRACTICE_LABEL = 'Card practice';

interface StudySessionPlanStep {
  key: string;
  title: string;
  detail?: string;
  /** Whole minutes, at least 1; absent when the step has no card count to estimate from. */
  minutes?: number;
}

export interface StudySessionPlan {
  steps: StudySessionPlanStep[];
  /** The sum of the steps' estimates, when every step has one. */
  totalMinutes?: number;
  /** Whether the first step is the due-review step, so Start runs a review. */
  startsWithDueReview: boolean;
}

function minutesFor(reviewEquivalents: number, meanReviewSeconds: number): number {
  return Math.max(1, Math.ceil((reviewEquivalents * meanReviewSeconds) / 60));
}

function describeStep(
  step: StudyFlowStep,
  lessonCardsById: ReadonlyMap<string, Card[]>,
  meanReviewSeconds: number,
): StudySessionPlanStep {
  if (step.kind === 'lesson') {
    const cards = lessonCardsById.get(step.lessonId) ?? [];
    const fresh = cards.filter((card) => card.lastReviewed === null).length;
    return {
      key: `lesson:${step.lessonId}`,
      title: step.label,
      detail:
        cards.length === 0
          ? 'Read notes'
          : fresh === cards.length
            ? `Learn ${countOf(fresh, 'new card')}`
            : `Learn ${countOf(cards.length, 'card')}${fresh > 0 ? ` (${fresh} new)` : ''}`,
      minutes:
        cards.length === 0
          ? undefined
          : minutesFor(
              cards.length - fresh + fresh * NEW_CARD_REVIEW_EQUIVALENTS,
              meanReviewSeconds,
            ),
    };
  }
  if (step.kind === 'practice') {
    return {
      key: `practice:${step.nodeKey}`,
      title: CARD_PRACTICE_LABEL,
    };
  }
  return {
    key: `questions:${step.nodeKey}`,
    title: step.label,
    detail: step.reason ?? 'Independent exam question',
  };
}

export function planStudySession({
  decision,
  lessonCardsById,
  meanReviewSeconds,
}: {
  decision: StudyFlowDecision;
  lessonCardsById: ReadonlyMap<string, Card[]>;
  meanReviewSeconds: number;
}): StudySessionPlan {
  if (decision.kind !== 'step' && decision.kind !== 'choice') {
    return { steps: [], startsWithDueReview: false };
  }
  const first = decision.step;
  const startsWithDueReview = first.kind === 'practice' && first.mode === 'recurring';
  const steps = [describeStep(first, lessonCardsById, meanReviewSeconds)];
  const totalMinutes = steps.every((step) => step.minutes !== undefined)
    ? steps.reduce((sum, step) => sum + step.minutes!, 0)
    : undefined;
  return { steps, totalMinutes, startsWithDueReview };
}
