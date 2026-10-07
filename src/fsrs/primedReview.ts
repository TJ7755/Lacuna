import type { ReviewLog } from '../db/types';

/**
 * How soon after an earlier answer in the same session a graded answer counts as
 * primed: recalled from working memory rather than retrieved after a real gap.
 */
export const PRIMING_WINDOW_MS = 10 * 60 * 1_000;

/** Whether an answer at `now` in `sessionId` follows an earlier answer to the same card. */
export function isPrimedReview(
  history: readonly ReviewLog[],
  sessionId: string,
  now: number,
): boolean {
  return history.some(
    (review) =>
      review.sessionId === sessionId &&
      review.timestamp <= now &&
      now - review.timestamp < PRIMING_WINDOW_MS,
  );
}

/**
 * Whether every answer after the first exposure was primed, so the card has not yet
 * cleared a single spaced retest. Such a card supports no short-term recall claim.
 */
export function lacksUnprimedRetest(history: readonly ReviewLog[]): boolean {
  if (history.length < 2) return false;
  const ordered = [...history].sort((a, b) => a.timestamp - b.timestamp);
  return ordered.slice(1).every((review) => review.primed === true);
}
