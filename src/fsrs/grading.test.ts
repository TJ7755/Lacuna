import { describe, expect, it } from 'vitest';
import type { UserPerformance } from '../db/types';
import { emptyPerformance, gradeFromResponse, updatePerformance } from './grading';

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
