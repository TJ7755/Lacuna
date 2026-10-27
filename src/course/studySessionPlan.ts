// Preview only the next block. Later work is selected from fresh evidence after it finishes.

import type { Card } from '../db/types';
import type { CourseStudyFlowSnapshot } from './studyFlowSnapshot';
import {
  STUDY_REVIEW_BLOCK_SIZE,
  type StudyFlowDecision,
  type StudyFlowStep,
} from './studyFlowPlanner';
import { countOf } from '../utils/plural';

/** A new card is introduced and then recalled at least twice in its first session. */
const NEW_CARD_REVIEW_EQUIVALENTS = 3;

export interface StudySessionPlanStep {
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
  snapshot: CourseStudyFlowSnapshot,
  lessonCardsById: ReadonlyMap<string, Card[]>,
  meanReviewSeconds: number,
): StudySessionPlanStep {
  if (step.kind === 'lesson') {
    const cards = lessonCardsById.get(step.lessonId) ?? [];
    const fresh = cards.filter((card) => card.lastReviewed === null).length;
    return {
      key: `lesson:${step.lessonId}`,
      title: step.label,
      detail: `Learn · ${
        cards.length === 0
          ? 'Notes only'
          : fresh === cards.length
            ? countOf(fresh, 'new card')
            : fresh > 0
              ? `${countOf(cards.length, 'card')}, ${fresh} new`
              : countOf(cards.length, 'card')
      }`,
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
    const count =
      step.mode === 'catch-up'
        ? (snapshot.catchUpEligibleCount ?? 0)
        : step.mode === 'assessment'
          ? (snapshot.assessmentOptions.find((option) => option.assessmentId === step.assessmentId)
              ?.eligibleCount ?? 0)
          : step.mode === 'exam'
            ? snapshot.examPracticeEligibleCount
            : step.mode === 'recurring'
              ? snapshot.recurringPracticeEligibleCount
              : (snapshot.practiceByKey.get(step.nodeKey)?.eligibleCount ?? 0);
    return {
      key: `practice:${step.nodeKey}`,
      title: step.mode === 'recurring' ? 'Review due cards' : step.label,
      detail: `${countOf(count, 'card')} available · up to ${STUDY_REVIEW_BLOCK_SIZE} reviews`,
      minutes: count > 0 ? minutesFor(STUDY_REVIEW_BLOCK_SIZE, meanReviewSeconds) : undefined,
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
  snapshot,
  lessonCardsById,
  meanReviewSeconds,
}: {
  decision: StudyFlowDecision;
  snapshot: CourseStudyFlowSnapshot;
  lessonCardsById: ReadonlyMap<string, Card[]>;
  meanReviewSeconds: number;
}): StudySessionPlan {
  if (decision.kind !== 'step' && decision.kind !== 'choice') {
    return { steps: [], startsWithDueReview: false };
  }
  const first = decision.step;
  const startsWithDueReview = first.kind === 'practice' && first.mode === 'recurring';
  const steps = [describeStep(first, snapshot, lessonCardsById, meanReviewSeconds)];
  const totalMinutes = steps.every((step) => step.minutes !== undefined)
    ? steps.reduce((sum, step) => sum + step.minutes!, 0)
    : undefined;
  return { steps, totalMinutes, startsWithDueReview };
}
