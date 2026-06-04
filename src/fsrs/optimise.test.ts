import { describe, it, expect } from 'vitest';
import { checkParameters, default_w } from 'ts-fsrs';
import {
  buildBindingItems,
  countReviews,
  evaluateParameters,
  historyToOptimiserItems,
  optimiseParameters,
  reviewSequences,
  validateFittedWeights,
  MIN_OPTIMISE_REVIEWS,
} from './optimise';
import { MS_PER_DAY } from './params';
import type { Card, Grade, ReviewLog } from '../db/types';

/** A card carrying a synthetic grade/timestamp sequence (other fields are filler). */
function cardWith(grades: Grade[], startMs: number, gapDays = 2): Card {
  const history: ReviewLog[] = grades.map((grade, i) => ({
    timestamp: startMs + i * gapDays * MS_PER_DAY,
    grade,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  }));
  return {
    id: Math.random().toString(36).slice(2),
    deckId: 'd',
    type: 'front_back',
    front: '',
    back: '',
    stability: 1,
    difficulty: 5,
    lastReviewed: history[history.length - 1]?.timestamp ?? null,
    reps: grades.length,
    lapses: grades.filter((g) => g === 1).length,
    state: 2,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history,
    createdAt: startMs,
  };
}

// A spread of realistic sequences: mostly recalled, the odd lapse.
function syntheticDeck(): Card[] {
  const start = Date.UTC(2026, 0, 1);
  const patterns: Grade[][] = [
    [3, 3, 3, 4, 3],
    [3, 1, 3, 3, 2],
    [2, 3, 3, 1, 3, 3],
    [4, 4, 3, 3],
    [3, 1, 1, 3, 3, 4],
    [3, 3, 2, 3],
  ];
  return patterns.map((p, i) => cardWith(p, start + i * MS_PER_DAY));
}

function fakeBinding(result: number[]) {
  return {
    FSRSBindingReview: class {
      constructor(
        public rating: number,
        public deltaT: number,
      ) {}
    },
    FSRSBindingItem: class {
      constructor(public reviews: unknown[]) {}
    },
    computeParameters: async () => result,
  };
}

describe('review extraction and gating', () => {
  it('counts every review and extracts non-empty sequences', () => {
    const cards = syntheticDeck();
    const totalGrades = 5 + 5 + 6 + 4 + 6 + 4;
    expect(countReviews(cards)).toBe(totalGrades);
    expect(reviewSequences(cards)).toHaveLength(cards.length);
  });

  it('exposes a sensible minimum-review threshold', () => {
    expect(MIN_OPTIMISE_REVIEWS).toBeGreaterThanOrEqual(100);
    // A tiny deck is below the bar (the UI gates the action on this).
    expect(countReviews(syntheticDeck())).toBeLessThan(MIN_OPTIMISE_REVIEWS);
  });
});

describe('evaluateParameters', () => {
  it('returns a finite mean log loss over scored (non-first) reviews', () => {
    const seqs = reviewSequences(syntheticDeck());
    const { logLoss, scored } = evaluateParameters(seqs, [...default_w]);
    expect(Number.isFinite(logLoss)).toBe(true);
    expect(logLoss).toBeGreaterThan(0);
    // First review of each card is unscored (no prior prediction).
    const expectedScored = countReviews(syntheticDeck()) - syntheticDeck().length;
    expect(scored).toBe(expectedScored);
  });
});

describe('optimiseParameters', () => {
  it('converts card history into FSRS binding review items', () => {
    const items = historyToOptimiserItems([cardWith([3, 1, 4], Date.UTC(2026, 0, 1), 2)]);
    expect(items).toHaveLength(1);
    expect(items[0].reviews).toEqual([
      { rating: 3, deltaT: 0 },
      { rating: 1, deltaT: 2 },
      { rating: 4, deltaT: 2 },
    ]);
  });

  it('maps review items to binding class instances', () => {
    const binding = fakeBinding([...default_w]);
    const trainSet = buildBindingItems(historyToOptimiserItems(syntheticDeck()), binding);
    expect(trainSet).toHaveLength(syntheticDeck().length);
  });

  it('produces a valid 21-weight array within FSRS bounds', async () => {
    const cards = syntheticDeck();
    const result = await optimiseParameters(cards, fakeBinding([...default_w]));

    expect(result.w).toHaveLength(21);
    expect(() => checkParameters(result.w)).not.toThrow();
    expect(result.scored).toBeGreaterThan(0);
  });

  it('reports progress from 0 to 1', async () => {
    const seen: number[] = [];
    const binding = {
      ...fakeBinding([...default_w]),
      computeParameters: async (
        _items: unknown[],
        options?: { progress?: (current: number, total: number) => void },
      ) => {
        options?.progress?.(1, 2);
        options?.progress?.(2, 2);
        return [...default_w];
      },
    };
    await optimiseParameters(syntheticDeck(), binding, { onProgress: (f) => seen.push(f) });
    expect(seen[seen.length - 1]).toBeCloseTo(1, 6);
    expect(seen.every((f) => f > 0 && f <= 1)).toBe(true);
  });

  it('rejects out-of-range optimiser weights', async () => {
    const invalid = [...default_w];
    invalid[0] = -1;
    await expect(
      optimiseParameters(syntheticDeck(), fakeBinding(invalid)),
    ).rejects.toThrow('outside the valid FSRS range');
  });
});

describe('validateFittedWeights', () => {
  it('rejects malformed parameter arrays', () => {
    expect(() => validateFittedWeights([1, 2, 3])).toThrow('invalid parameter array');
  });
});
