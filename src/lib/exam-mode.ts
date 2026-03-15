/**
 * Exam Mode scheduling logic.
 *
 * Exam Mode activates when a deck has an exam date attached. It re-ranks
 * cards by ascending predicted retention at the exam date — weakest cards
 * first — rather than using FSRS's standard due-date ordering.
 *
 * This module is a stub. Full implementation will follow once the FSRS
 * wrapper and database client are operational.
 */

// TODO: implement retrievability computation and card ranking.

export type ExamModeSession = {
  deckId: string;
  examDate: Date;
  cardIds: string[];
};

/**
 * Stub: returns an empty session. Replace with real implementation.
 */
export function buildExamModeSession(
  deckId: string,
  examDate: Date,
): ExamModeSession {
  return { deckId, examDate, cardIds: [] };
}
