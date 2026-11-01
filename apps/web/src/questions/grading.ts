import type { Grade } from '@lacuna/core/db/types';

export interface QuestionGradeEvidence {
  marksEarned: number;
  marksAvailable: number;
  hasUndeterminedVerdict: boolean;
  hasUnresolvedDispute: boolean;
}

/** Minimum awarded proportion for Hard; full marks remain Good. */
export const PRACTICE_HARD_THRESHOLD = 0.6;

export function gradeQuestionAttempt(evidence: QuestionGradeEvidence): Grade | null {
  if (evidence.hasUndeterminedVerdict || evidence.hasUnresolvedDispute) return null;
  if (
    !Number.isSafeInteger(evidence.marksEarned) ||
    !Number.isSafeInteger(evidence.marksAvailable) ||
    evidence.marksAvailable <= 0 ||
    evidence.marksEarned < 0 ||
    evidence.marksEarned > evidence.marksAvailable
  ) {
    return null;
  }
  if (evidence.marksEarned === evidence.marksAvailable) return 3;
  return evidence.marksEarned / evidence.marksAvailable >= PRACTICE_HARD_THRESHOLD ? 2 : 1;
}
