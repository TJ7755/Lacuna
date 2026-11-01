import type { Grade } from '../db/types';

export interface QuestionGradeEvidence {
  marksEarned: number;
  marksAvailable: number;
  hasUndeterminedVerdict: boolean;
  hasUnresolvedDispute: boolean;
}

/**
 * Questions use conservative binary FSRS evidence. Hard is a successful recall,
 * so partial work must not use it and quietly lengthen the interval.
 */
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
  return evidence.marksEarned === evidence.marksAvailable ? 3 : 1;
}
