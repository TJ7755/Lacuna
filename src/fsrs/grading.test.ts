import { describe, expect, it } from 'vitest';
import type { UserPerformance } from '../db/types';
import {
  emptyPerformance,
  FULL_MARKS_EASY_SECONDS,
  gradeFromMarks,
  gradeFromResponse,
  HINT_TIME_PENALTY_SEC,
  updatePerformance,
} from './grading';

function performance(
  totalCorrectReviews: number,
  runningMeanResponseTime = 100,
  runningStdDevResponseTime = 0,
): UserPerformance {
  return {
    deckId: 'deck-1',
    runningMeanResponseTime,
    runningStdDevResponseTime,
    m2: 0,
    totalCorrectReviews,
  };
}

describe('gradeFromResponse', () => {
  it('always grades an incorrect response as Again', () => {
    expect(gradeFromResponse(false, 0, undefined)).toBe(1);
    expect(gradeFromResponse(false, 100, performance(20, 10, 4))).toBe(1);
  });

  describe.each([0, 1, 2, 19])('with %i correct reviews', (totalCorrectReviews) => {
    it.each([
      [2.999, 4],
      [3, 3],
      [8, 3],
      [8.001, 2],
    ] as const)('grades a response at %s seconds as %i', (responseTimeSec, expected) => {
      expect(gradeFromResponse(true, responseTimeSec, performance(totalCorrectReviews))).toBe(
        expected,
      );
    });
  });

  describe('with 20 correct reviews', () => {
    const calibratedPerformance = performance(20, 10, 4);

    it.each([
      [6.999, 4],
      [7, 3],
      [13, 3],
      [13.001, 2],
    ] as const)('grades a response at %s seconds as %i', (responseTimeSec, expected) => {
      expect(gradeFromResponse(true, responseTimeSec, calibratedPerformance)).toBe(expected);
    });
  });
});

describe('gradeFromMarks', () => {
  it.each([
    { marksEarned: 4, marksAvailable: 4, responseTimeSec: 2.999, selfCorrected: false, grade: 4 },
    { marksEarned: 4, marksAvailable: 4, responseTimeSec: 3, selfCorrected: false, grade: 3 },
    { marksEarned: 4, marksAvailable: 4, responseTimeSec: 20, selfCorrected: true, grade: 3 },
    { marksEarned: 3, marksAvailable: 4, responseTimeSec: 2, selfCorrected: true, grade: 2 },
    { marksEarned: 1, marksAvailable: 4, responseTimeSec: 20, selfCorrected: true, grade: 2 },
    { marksEarned: 3, marksAvailable: 4, responseTimeSec: 2, selfCorrected: false, grade: 1 },
    { marksEarned: 0, marksAvailable: 4, responseTimeSec: 2, selfCorrected: true, grade: 1 },
  ])(
    'maps $marksEarned/$marksAvailable marks at $responseTimeSec seconds to grade $grade',
    ({ marksEarned, marksAvailable, responseTimeSec, selfCorrected, grade }) => {
      expect(gradeFromMarks(marksEarned, marksAvailable, responseTimeSec, selfCorrected)).toBe(
        grade,
      );
    },
  );

  it.each([
    [Number.NaN, 4],
    [4, Number.NaN],
    [1, 0],
    [1, -1],
    [-1, 4],
    [5, 4],
  ])('grades invalid marks %s/%s as Again', (marksEarned, marksAvailable) => {
    expect(gradeFromMarks(marksEarned, marksAvailable, 2, true)).toBe(1);
  });

  it('uses a named fast-response boundary', () => {
    expect(FULL_MARKS_EASY_SECONDS).toBe(3);
    expect(gradeFromMarks(1, 1, FULL_MARKS_EASY_SECONDS - 0.001, false)).toBe(4);
    expect(gradeFromMarks(1, 1, FULL_MARKS_EASY_SECONDS, false)).toBe(3);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.001])(
    'does not award Easy for an invalid response time of %s',
    (responseTimeSec) => {
      expect(gradeFromMarks(1, 1, responseTimeSec, false)).toBe(3);
    },
  );
});

describe('HINT_TIME_PENALTY_SEC', () => {
  it('is a small, fixed, tunable penalty in seconds', () => {
    expect(HINT_TIME_PENALTY_SEC).toBe(1.5);
  });

  // gradeFromResponse itself has no notion of hints — it always grades exactly the
  // responseTimeSec it is given. The penalty is applied by the caller (see the answer()
  // callback in src/pages/LearnMode.tsx) only to the value passed into this function for
  // silent-mode grading; ReviewLog.responseTimeSec and updatePerformance's calibration
  // input both stay the true, unpenalised time. These tests exercise that call pattern.
  it('nudges a borderline response past a grade boundary when a hint was used', () => {
    const perf = performance(20, 10, 4); // mu=10, sigma=4 -> Easy below 7, Hard above 13.
    const trueResponseTime = 6.6; // Comfortably Easy on its own.

    expect(gradeFromResponse(true, trueResponseTime, perf)).toBe(4);
    expect(gradeFromResponse(true, trueResponseTime + HINT_TIME_PENALTY_SEC, perf)).toBe(3);
  });

  it('leaves a fast response unaffected if the penalty does not cross a boundary', () => {
    const perf = performance(20, 10, 4);
    const trueResponseTime = 2;

    expect(gradeFromResponse(true, trueResponseTime, perf)).toBe(4);
    expect(gradeFromResponse(true, trueResponseTime + HINT_TIME_PENALTY_SEC, perf)).toBe(4);
  });
});

describe('emptyPerformance', () => {
  it('creates an empty profile for the requested deck', () => {
    expect(emptyPerformance('deck-1')).toEqual({
      deckId: 'deck-1',
      runningMeanResponseTime: 0,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 0,
    });
  });
});

describe('updatePerformance', () => {
  it('records the first observation with zero variance', () => {
    expect(updatePerformance(emptyPerformance('deck-1'), 6)).toEqual({
      deckId: 'deck-1',
      runningMeanResponseTime: 6,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });
  });

  it('updates the population mean, variance aggregate, and standard deviation', () => {
    const result = [2, 4, 4, 4, 5, 5, 7, 9].reduce(updatePerformance, emptyPerformance('deck-1'));

    expect(result).toEqual({
      deckId: 'deck-1',
      runningMeanResponseTime: 5,
      runningStdDevResponseTime: 2,
      m2: 32,
      totalCorrectReviews: 8,
    });
  });

  it('returns a new profile without mutating the input', () => {
    const original = performance(1, 4, 0);
    const snapshot = { ...original };

    const result = updatePerformance(original, 8);

    expect(result).not.toBe(original);
    expect(original).toEqual(snapshot);
    expect(result.runningMeanResponseTime).toBe(6);
    expect(result.m2).toBe(8);
    expect(result.runningStdDevResponseTime).toBe(2);
    expect(result.totalCorrectReviews).toBe(2);
  });
});
