// A question set's standing for the Questions list: the latest score, a short history and
// the attempt to resume, drawn from the learner's own attempts.

import type { QuestionSetAttemptRecord } from './questionSetAttempts';
import { summariseSelfMarking } from './questionSets';

/** The history shows this many of the most recent completed attempts. */
export const SCORE_HISTORY_LENGTH = 5;

export interface QuestionSetProgress {
  /** Completed attempts' scores as whole percentages, oldest first, at most five. */
  history: number[];
  /** The most recent completed attempt's score. */
  latest?: number;
  /** When the learner last worked on the set, completed or not. */
  lastTriedAt?: number;
  /** The newest attempt still open (in progress or awaiting marking), to continue. */
  open?: QuestionSetAttemptRecord;
}

export function questionSetProgress(
  attempts: readonly QuestionSetAttemptRecord[],
): QuestionSetProgress {
  const newestFirst = [...attempts].sort((a, b) => b.updatedAt - a.updatedAt);
  const scores: number[] = [];
  for (const attempt of newestFirst) {
    if (attempt.status !== 'complete' || scores.length === SCORE_HISTORY_LENGTH) continue;
    const { awarded, available } = summariseSelfMarking(attempt.receipt, attempt.decisions).total;
    if (available > 0) scores.push(Math.round((awarded / available) * 100));
  }
  const history = scores.reverse();
  return {
    history,
    latest: history.at(-1),
    lastTriedAt: newestFirst[0]?.updatedAt,
    open: newestFirst.find((attempt) => attempt.status !== 'complete'),
  };
}
