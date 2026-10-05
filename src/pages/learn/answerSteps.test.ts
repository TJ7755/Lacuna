import { describe, expect, it } from 'vitest';
import { answerCorrect, answerGrade, sessionStopAfterAnswer } from './answerSteps';

const base = {
  machineMarked: null,
  manualGrade: null,
  correct: true,
  hintUsed: false,
  performance: undefined,
};

describe('answerCorrect', () => {
  it('reads machine marks, manual grades and binary answers', () => {
    expect(answerCorrect({ correct: false, marksEarned: 0, marksAvailable: 2 })).toBe(false);
    expect(answerCorrect(1)).toBe(false);
    expect(answerCorrect(2)).toBe(true);
    expect(answerCorrect(true)).toBe(true);
    expect(answerCorrect(false)).toBe(false);
  });
});

describe('answerGrade', () => {
  it('takes a manual grade as given', () => {
    expect(answerGrade({ ...base, manualGrade: 2, responseTimeSec: 1 })).toBe(2);
  });

  it('infers the grade from timing, with the hint penalty applied', () => {
    expect(answerGrade({ ...base, responseTimeSec: 2 })).toBe(4);
    // 2s plus the 1.5s hint penalty is no longer a fast answer.
    expect(answerGrade({ ...base, responseTimeSec: 2, hintUsed: true })).toBe(3);
    expect(answerGrade({ ...base, correct: false, responseTimeSec: 2 })).toBe(1);
  });

  it('grades machine-marked answers from their marks, ignoring a manual grade', () => {
    const machineMarked = { correct: false, marksEarned: 0, marksAvailable: 2 };
    expect(answerGrade({ ...base, machineMarked, manualGrade: 4, responseTimeSec: 2 })).toBe(1);
  });
});

describe('sessionStopAfterAnswer', () => {
  const quiet = {
    deckReviews: 5,
    maxReviewsPerDay: undefined,
    dailyReviewGoal: undefined,
    sessionTimeLimitMinutes: undefined,
    limitOverride: false,
    timeLimitOverride: false,
    revisionWindowEndsAt: undefined,
    sessionStartMs: 0,
    now: 600_000,
  };

  it('continues when no limit applies', () => {
    expect(sessionStopAfterAnswer(quiet)).toBeNull();
  });

  it('checks the daily limit before the goal, and lets an override skip both', () => {
    const both = { ...quiet, maxReviewsPerDay: 5, dailyReviewGoal: 5 };
    expect(sessionStopAfterAnswer(both)).toEqual([false, true]);
    expect(sessionStopAfterAnswer({ ...quiet, dailyReviewGoal: 5 })).toEqual([true, false, false, true]);
    expect(sessionStopAfterAnswer({ ...both, limitOverride: true })).toBeNull();
  });

  it('stops when the revision window or the session time runs out', () => {
    expect(sessionStopAfterAnswer({ ...quiet, revisionWindowEndsAt: 600_000 })).toEqual([
      false,
      false,
      true,
    ]);
    const timed = { ...quiet, sessionTimeLimitMinutes: 10, sessionStartMs: 1 };
    expect(sessionStopAfterAnswer({ ...timed, now: 600_001 })).toEqual([false, false, true]);
    expect(sessionStopAfterAnswer({ ...timed, now: 599_000 })).toBeNull();
    expect(sessionStopAfterAnswer({ ...timed, now: 600_001, timeLimitOverride: true })).toBeNull();
  });
});
