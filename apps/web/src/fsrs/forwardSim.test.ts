import { describe, it, expect } from 'vitest';
import {
  forgettingCurve,
  rAtExam,
  rAtExamIfReviewedNow,
  deltaR,
  simContext,
} from '@lacuna/core/fsrs/forwardSim';
import { makeEngine, modelOf } from '@lacuna/core/fsrs/fsrs';
import { defaultFsrsParameters, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { Card, LegacyDeckRecord } from '@lacuna/core/db/types';

const NOW = Date.UTC(2026, 6, 1, 12);

function makeDeck(partial: Partial<LegacyDeckRecord> = {}): LegacyDeckRecord {
  return {
    id: 'd1',
    name: 'Test deck',
    examDate: 0,
    createdAt: 0,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    ...partial,
  };
}

function makeCard(partial: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    conceptId: 'concept-c1',
    deckId: 'd1',
    schedulingUnitId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    stability: null,
    stabilityFast: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('FSRS-7 predictions', () => {
  const model = makeEngine(defaultFsrsParameters()).model;
  it('uses the upstream dual-trace reference values, including fractional days', () => {
    const state = { stability: 3.9221, stabilityFast: 3.13768, difficulty: 3.53072398 };
    expect(forgettingCurve(0.05, state, model)).toBeCloseTo(0.9611346211630858, 12);
    expect(forgettingCurve(7, state, model)).toBeCloseTo(0.8854090932694928, 12);
    expect(forgettingCurve(-1, state, model)).toBeCloseTo(0.99999, 12);
  });
  it('does not claim recall for opaque old-model memory', () => {
    const opaque = makeCard({ stability: 7, difficulty: 5, state: 2, lastReviewed: NOW });
    expect(rAtExam(opaque, NOW + MS_PER_DAY, NOW, model)).toBeNull();
    expect(rAtExam(makeCard(), NOW + MS_PER_DAY, NOW, model)).toBe(0);
  });
});

describe('deltaR', () => {
  it('new-card gain is its initial Good recall at the exam', () => {
    const deck = makeDeck({ examDate: NOW + 7 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const card = makeCard();
    const now = NOW;
    expect(rAtExam(card, deck.examDate, now, ctx.model)).toBe(0);
    expect(deltaR(card, deck.examDate, now, ctx)).toBeCloseTo(0.8854090932694928, 12);
  });

  it('projects less marginal gain after stronger spaced-success histories', () => {
    const now = NOW + 30 * MS_PER_DAY;
    const deck = makeDeck({ examDate: now + 7 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const model = modelOf(deck.fsrsParameters);
    const initial = model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
    // Upstream model reference gains: Good now after 30 days, exam seven days later.
    const cases = [
      [0, 0.16239185445021476],
      [1, 0.1105003337316931],
      [10, 0.08459023947069833],
      [100, 0.05750853299116809],
    ];
    for (const [gap, expectedGain] of cases) {
      const memory =
        gap === 0
          ? initial
          : model.step({
              memoryState: initial,
              rating: 3,
              elapsedDays: gap,
            });
      const card = makeCard({ ...memory, lastReviewed: NOW, state: 2, reps: gap === 0 ? 1 : 2 });
      expect(deltaR(card, deck.examDate, now, ctx)).toBeCloseTo(expectedGain, 12);
    }
  });

  it('on exam day a review reaches the upstream recall ceiling', () => {
    const deck = makeDeck({ examDate: NOW + 5 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const now = deck.examDate; // no time remaining
    const memory = ctx.model.step({ memoryState: null, rating: 3, elapsedDays: 0 });
    const card = makeCard({ ...memory, lastReviewed: NOW, state: 2 });
    expect(rAtExamIfReviewedNow(card, ctx.expectedGrade, deck.examDate, now, ctx)).toBeCloseTo(
      0.99999,
      12,
    );
  });
});
