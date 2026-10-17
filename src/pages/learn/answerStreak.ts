/** Consecutive correct answers that earn a small celebration. */
export const STREAK_STEP = 5;

/** The next run length after an answer: a correct answer extends it, anything else resets it. */
export function nextRun(run: number, correct: boolean): number {
  return correct ? run + 1 : 0;
}

/** Whether a run has just reached a celebration point (5, 10, 15 and so on). */
export function isStreakMilestone(run: number): boolean {
  return run > 0 && run % STREAK_STEP === 0;
}
