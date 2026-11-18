import { describe, it, expect } from 'vitest';
import {
  computeParameters,
  FSRSBindingItem,
  FSRSBindingReview,
} from '@open-spaced-repetition/binding';
import { checkFSRS7Parameters, FSRS7_DEFAULT_WEIGHTS as default_w } from 'ts-fsrs/models/fsrs-7';
import {
  chronologicallySplitSequences,
  countReviews,
  evaluateParameters,
  optimiseParameters,
  reviewSequences,
  sequenceToBindingReviews,
  tryValidateFittedWeights,
  validateFittedWeights,
} from './optimise';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card, Grade, ReviewLog } from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';

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
    conceptId: 'concept-optimisation-card',
    deckId: 'd',
    schedulingUnitId: 'd',
    type: 'front_back',
    front: '',
    back: '',
    stability: 1,
    stabilityFast: null,
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
    updatedAt: startMs,
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

const bindingDeps = {
  computeParameters,
  createItem: (reviews: { rating: number; deltaT: number }[]) =>
    new FSRSBindingItem(reviews.map((r) => new FSRSBindingReview(r.rating, r.deltaT))),
};

describe('history-to-binding conversion', () => {
  it('maps grade sequences to binding reviews with deltaT in days', () => {
    const card = cardWith([3, 4, 2], Date.UTC(2026, 0, 1), 3);
    const reviews = sequenceToBindingReviews(reviewSequences([card])[0]);
    expect(reviews[0]).toEqual({ rating: 3, deltaT: 0 });
    expect(reviews[1]).toEqual({ rating: 4, deltaT: 3 });
    expect(reviews[2]).toEqual({ rating: 2, deltaT: 3 });
  });
});

describe('review extraction and gating', () => {
  it('uses canonical event rows when supplied instead of a stale card projection', () => {
    const source = cardWith([3, 1, 4], Date.UTC(2026, 0, 1));
    const card = { ...source, history: [source.history[0]] };
    const reviewHistory: ReviewHistoryEntry[] = source.history.map((entry, index) => ({
      ...entry,
      id: `review:event:${index}`,
      cardId: source.id,
      deckId: source.deckId,
      schedulingUnitId: source.deckId,
    }));
    const staleCard = { ...cardWith([2], Date.UTC(2026, 0, 20)), id: 'stale-card' };

    expect(countReviews([card, staleCard], reviewHistory)).toBe(3);
    expect(reviewSequences([card, staleCard], reviewHistory)[0].grades).toEqual([3, 1, 4]);
  });

  it('counts every review and extracts non-empty sequences', () => {
    const cards = syntheticDeck();
    const totalGrades = 5 + 5 + 6 + 4 + 6 + 4;
    expect(countReviews(cards)).toBe(totalGrades);
    expect(reviewSequences(cards)).toHaveLength(cards.length);
  });
});

describe('validateFittedWeights', () => {
  it('accepts the default FSRS weight set', () => {
    expect(() => validateFittedWeights([...default_w])).not.toThrow();
    expect(tryValidateFittedWeights([...default_w]).ok).toBe(true);
  });

  it.each([
    ['legacy FSRS-6 layout', [...default_w].slice(0, 21)],
    ['non-finite weight', [...default_w].map((w, i) => (i === 20 ? NaN : w))],
    ['initial stability outside bounds', [...default_w].map((w, i) => (i === 0 ? 999 : w))],
    ['fast-trace weight outside bounds', [...default_w].map((w, i) => (i === 33 ? 1 : w))],
    ['unordered initial stabilities', [...default_w].map((w, i) => (i === 0 ? 4 : w))],
    ['fast-trace cross-weight constraint', [...default_w].map((w, i) => (i === 25 ? 0.98 : w))],
  ])('rejects %s', (_name, weights) => {
    expect(tryValidateFittedWeights(weights).ok).toBe(false);
    expect(() => validateFittedWeights(weights)).toThrow();
  });
});

describe('chronological train/validation split', () => {
  it('puts roughly the train fraction of reviews into training', () => {
    const cards = syntheticDeck();
    const seqs = reviewSequences(cards);
    const total = countReviews(cards);
    const split = chronologicallySplitSequences(seqs, 0.8);
    const validationSequences = split.validationSequences;
    const cutoffTimestamp = split.cutoffTimestamp;

    const trainCount = split.trainSequences.reduce((s, seq) => s + seq.grades.length, 0);
    const valCount = validationSequences.reduce((s, seq) => s + seq.grades.length, 0);

    expect(trainCount + valCount).toBe(total);
    // Every validation review is strictly after the cutoff.
    for (const seq of validationSequences) {
      for (const t of seq.timestamps) {
        expect(t).toBeGreaterThan(cutoffTimestamp);
      }
    }
    // Every training review is at or before the cutoff.
    for (const seq of split.trainSequences) {
      for (const t of seq.timestamps) {
        expect(t).toBeLessThanOrEqual(cutoffTimestamp);
      }
    }
  });

  it('handles a deck with every review before the cutoff', () => {
    const cards = syntheticDeck();
    const seqs = reviewSequences(cards);
    const split = chronologicallySplitSequences(seqs, 1.0);
    const valCount = split.validationSequences.reduce((s, seq) => s + seq.grades.length, 0);
    expect(valCount).toBe(0);
  });
});

describe('evaluateParameters', () => {
  it('scores fractional-day lapses with the FSRS-7 dual-trace replay, including training context', () => {
    const start = Date.UTC(2026, 0, 1);
    const sequences = [
      {
        timestamps: [0, 0.25, 0.375, 2.875, 3.375].map((days) => start + days * MS_PER_DAY),
        grades: [3, 1, 3, 4, 2] as Grade[],
      },
    ];
    // Frozen using binding 0.6.1's Rust nextStates and the dual-trace curve.
    // Float32 native states account for the tolerance against the JS runtime.
    const all = evaluateParameters(sequences, [...default_w]);
    expect(all.scored).toBe(4);
    expect(all.logLoss).toBeCloseTo(0.8789291705688029, 6);
    const heldOut = evaluateParameters(sequences, [...default_w], undefined, {
      scoreAfterTimestamp: start + 0.25 * MS_PER_DAY,
    });
    expect(heldOut.scored).toBe(3);
    expect(heldOut.logLoss).toBeCloseTo(0.16551080683706929, 6);
    expect(sequenceToBindingReviews(sequences[0]).map((r) => r.deltaT)).toEqual([
      0, 0.25, 0.125, 2.5, 0.5,
    ]);
  });
});

describe('optimiseParameters', () => {
  it('produces a valid 34-weight array via the official trainer', async () => {
    const cards = syntheticDeck();
    const result = await optimiseParameters(cards, bindingDeps);

    expect(result.w).toHaveLength(34);
    expect(() => checkFSRS7Parameters(result.w)).not.toThrow();
    expect(Number.isFinite(result.before)).toBe(true);
    expect(Number.isFinite(result.after)).toBe(true);
    expect(result.scored).toBeGreaterThanOrEqual(0);
  });

  it('offers only a fit that improves the held-out loss', async () => {
    const cards = syntheticDeck();
    const sequences = reviewSequences(cards);
    const { cutoffTimestamp } = chronologicallySplitSequences(sequences);
    const overconfident = [...default_w];
    overconfident.splice(0, 4, 50, 100, 100, 100);
    const heldOutLoss = (w: number[]) =>
      evaluateParameters(sequences, w, 0.9, { scoreAfterTimestamp: cutoffTimestamp }).logLoss;
    const [better, worse] = [[...default_w], overconfident].sort(
      (a, b) => heldOutLoss(a) - heldOutLoss(b),
    );
    expect(heldOutLoss(better)).toBeLessThan(heldOutLoss(worse));
    const fit = (initialW: number[], fitted: number[]) =>
      optimiseParameters(cards, {
        ...bindingDeps,
        requestRetention: 0.9,
        initialW,
        computeParameters: async () => [...fitted],
      });

    const improved = await fit(worse, better);
    expect(improved.before).toBeCloseTo(heldOutLoss(worse), 12);
    expect(improved.after).toBeCloseTo(heldOutLoss(better), 12);
    expect(improved.isOutOfSampleWin).toBe(true);

    const regressed = await fit(better, worse);
    expect(regressed.after).toBeGreaterThan(regressed.before);
    expect(regressed.isOutOfSampleWin).toBe(false);
  });

  it('rejects out-of-range trainer output', async () => {
    const badCompute: typeof computeParameters = async () => {
      const w = [...default_w];
      w[0] = 999;
      return w;
    };
    await expect(
      optimiseParameters(syntheticDeck(), {
        ...bindingDeps,
        computeParameters: badCompute,
      }),
    ).rejects.toThrow(/outside FSRS valid ranges/);
  });

  it('forwards trainer progress callbacks as fractions from 0 to 1', async () => {
    const seen: number[] = [];
    const mockCompute: typeof computeParameters = async (_items, options) => {
      options?.progress?.(1, 4);
      options?.progress?.(2, 4);
      options?.progress?.(4, 4);
      return [...default_w];
    };
    await optimiseParameters(syntheticDeck(), {
      computeParameters: mockCompute,
      createItem: bindingDeps.createItem,
      onProgress: (f) => seen.push(f),
    });
    expect(seen).toEqual([0.25, 0.5, 1]);
  });
});
