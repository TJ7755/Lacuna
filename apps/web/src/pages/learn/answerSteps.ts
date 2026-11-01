import { performanceForReviewUnit } from '../../db/backingDecks';
import {
  recordReview,
  type RecordReviewArgs,
  type RecordReviewResult,
} from '../../db/reviewRepository';
import type { UserPerformance } from '../../db/types';
import { updatePerformance } from '../../fsrs/grading';
export { answerCorrect, answerFeedback, answerGrade, sessionStopAfterAnswer } from './answerPolicy';
export type { AnswerInput, AnswerResult, SessionStop } from './answerPolicy';
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
