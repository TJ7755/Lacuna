// The separable steps of grading a Learn mode answer: deciding its grade,
// persisting it, describing the outcome to the learner, and deciding whether the
// session stops. useLearnSession's `answer` composes them with its session state.

import { performanceForReviewUnit } from '../../db/backingDecks';
import {
  recordReview,
  type RecordReviewArgs,
  type RecordReviewResult,
} from '../../db/reviewRepository';
import type { Card, Grade, SchedulerConfig, UserPerformance } from '../../db/types';
import type { ExamDateContext } from '../../fsrs/examDate';
import {
  gradeFromMarks,
  gradeFromResponse,
  HINT_TIME_PENALTY_SEC,
  updatePerformance,
} from '../../fsrs/grading';
import { reviewFeedbackMessage, reviewRetentionMessage } from '../../fsrs/gradingFeedback';
import type { MachineMarkedAnswer } from './types';

export type AnswerInput = boolean | Grade | MachineMarkedAnswer;

export interface AnswerResult {
  undoAvailable: boolean;
  feedbackMessage?: string;
}

/** Whether an answer was correct: a machine mark, a manual grade above Again, or Yes. */
export function answerCorrect(input: AnswerInput): boolean {
  if (typeof input === 'object') return input.correct;
  if (typeof input === 'number') return input > 1;
  return input;
}

/**
 * The FSRS grade for an answer. Machine-marked answers are graded from their marks,
 * a manual grade is taken as given, and otherwise the grade is inferred from
 * correctness and timing. Hint use only nudges that inferred grade; the true response
 * time is what is persisted and calibrated on.
 */
export function answerGrade({
  machineMarked,
  manualGrade,
  correct,
  responseTimeSec,
  hintUsed,
  performance,
}: {
  machineMarked: MachineMarkedAnswer | null;
  manualGrade: Grade | null;
  correct: boolean;
  responseTimeSec: number;
  hintUsed: boolean;
  performance: UserPerformance | undefined;
}): Grade {
  if (machineMarked) {
    return gradeFromMarks(
      machineMarked.marksEarned,
      machineMarked.marksAvailable,
      responseTimeSec,
      false,
    );
  }
  return (
    manualGrade ??
    gradeFromResponse(
      correct,
      hintUsed ? responseTimeSec + HINT_TIME_PENALTY_SEC : responseTimeSec,
      performance,
    )
  );
}

/**
 * Record a review, then return the unit's performance calibrated on it. A correct
 * answer updates the cached performance in place; when the event had already been
 * committed (a retried submission) the stored performance is reloaded instead.
 */
export async function persistAnswer(
  review: RecordReviewArgs,
  unitId: string,
  performance: UserPerformance | undefined,
): Promise<{ result: RecordReviewResult; performance: UserPerformance | undefined }> {
  const result = await recordReview(review);
  if (!review.correct || !performance) return { result, performance };
  const next = result.recorded
    ? updatePerformance(performance, review.responseTimeSec)
    : await performanceForReviewUnit(unitId, result.kind);
  return { result, performance: next ?? performance };
}

/** The undo availability and learner-facing message for a scheduled review. */
export function answerFeedback({
  recorded,
  grade,
  card,
  deck,
  examDateContext,
}: {
  recorded: boolean;
  grade: Grade;
  card: Card;
  deck: SchedulerConfig;
  examDateContext: ExamDateContext | undefined;
}): AnswerResult {
  if (!recorded || card.due === null) return { undoAvailable: recorded };
  return {
    undoAvailable: true,
    feedbackMessage:
      reviewRetentionMessage(grade, card, deck, examDateContext) ??
      reviewFeedbackMessage(grade, card.due),
  };
}

/** Arguments for `finish`: goal reached, daily limit, time limit, daily review goal. */
export type SessionStop = [
  reachedGoal: boolean,
  limitReached?: boolean,
  timeLimitReached?: boolean,
  dailyGoalReached?: boolean,
];

/**
 * Whether a scheduled session stops after this answer, checked in order: the daily
 * review limit, the daily review goal, the revision window's budget and the session
 * time limit. "Continue anyway" overrides skip the limit and goal, or the time limit.
 */
export function sessionStopAfterAnswer({
  deckReviews,
  maxReviewsPerDay,
  dailyReviewGoal,
  sessionTimeLimitMinutes,
  limitOverride,
  timeLimitOverride,
  revisionWindowEndsAt,
  sessionStartMs,
  now,
}: {
  deckReviews: number;
  maxReviewsPerDay: number | undefined;
  dailyReviewGoal: number | undefined;
  sessionTimeLimitMinutes: number | undefined;
  limitOverride: boolean;
  timeLimitOverride: boolean;
  /** When the active revision window's budget runs out, if there is one. */
  revisionWindowEndsAt: number | undefined;
  sessionStartMs: number;
  now: number;
}): SessionStop | null {
  if (!limitOverride && maxReviewsPerDay && maxReviewsPerDay > 0) {
    if (deckReviews >= maxReviewsPerDay) return [false, true];
  }
  if (!limitOverride && dailyReviewGoal && dailyReviewGoal > 0) {
    if (deckReviews >= dailyReviewGoal) return [true, false, false, true];
  }
  if (revisionWindowEndsAt !== undefined && now >= revisionWindowEndsAt) {
    return [false, false, true];
  }
  if (
    !timeLimitOverride &&
    sessionTimeLimitMinutes &&
    sessionTimeLimitMinutes > 0 &&
    sessionStartMs > 0 &&
    (now - sessionStartMs) / 60000 >= sessionTimeLimitMinutes
  ) {
    return [false, false, true];
  }
  return null;
}
