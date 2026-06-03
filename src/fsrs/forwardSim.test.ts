import { describe, it, expect } from 'vitest';
import {
  curveFactor,
  forgettingCurve,
  rAtExam,
  rAtExamIfReviewedNow,
  deltaR,
  simContext,
} from './forwardSim';
import { makeEngine } from './fsrs';
import { defaultFsrsParameters, MS_PER_DAY } from './params';
import type { Card, Deck } from '../db/types';

function makeDeck(partial: Partial<Deck> = {}): Deck {
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
    deckId: 'd1',
    type: 'front_back',
    front: '',
    back: '',
    stability: null,
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
    ...partial,
  };
}

describe('forgettingCurve', () => {
  it('returns R = 0.90 exactly when t = S, for several decay values', () => {
    for (const decay of [-0.5, -0.1542, -0.2, -0.7, -0.1]) {
      for (const S of [1, 3.7, 10, 250]) {
        expect(forgettingCurve(S, S, decay)).toBeCloseTo(0.9, 12);
      }
    }
  });

  it('is 1 at t = 0 and decreases monotonically with elapsed time', () => {
    const decay = -0.1542;
    expect(forgettingCurve(0, 10, decay)).toBeCloseTo(1, 12);
    let prev = 1;
    for (const t of [1, 5, 10, 50, 200]) {
      const r = forgettingCurve(t, 10, decay);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });

  it('returns 0 for a non-positive stability (avoids divide-by-zero)', () => {
    expect(forgettingCurve(5, 0, -0.1542)).toBe(0);
    expect(forgettingCurve(5, -1, -0.1542)).toBe(0);
  });
});

describe('FSRS-6 reduces to FSRS-4.5', () => {
  it('curveFactor === 19/81 when w20 = 0.5 (decay = -0.5)', () => {
    // FSRS-4.5 used a fixed decay of -0.5; in FSRS-6 that is w20 = 0.5.
    expect(curveFactor(-0.5)).toBeCloseTo(19 / 81, 12);
  });
});

describe('rAtExam', () => {
  it('is 0 for a never-reviewed card', () => {
    const deck = makeDeck({ examDate: 10 * MS_PER_DAY });
    expect(rAtExam(makeCard(), deck.examDate, 0, -0.1542)).toBe(0);
  });

  it('equals 0.90 when the exam is exactly one stability-length away', () => {
    const decay = -0.1542;
    const S = 7;
    const card = makeCard({ stability: S, difficulty: 5, lastReviewed: 0 });
    const examDate = S * MS_PER_DAY;
    expect(rAtExam(card, examDate, 0, decay)).toBeCloseTo(0.9, 12);
  });
});

describe('deltaR', () => {
  it('new card: deltaR equals rAtExamIfReviewedNow (rAtExam = 0)', () => {
    const deck = makeDeck({ examDate: 7 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const card = makeCard();
    const now = 0;
    const withReview = rAtExamIfReviewedNow(
      card,
      ctx.expectedGrade,
      deck.examDate,
      now,
      ctx,
    );
    expect(rAtExam(card, deck.examDate, now, ctx.decay)).toBe(0);
    expect(deltaR(card, deck.examDate, now, ctx)).toBeCloseTo(withReview, 12);
  });

  it('collapses toward 0 as the card’s current exam-day R approaches 1', () => {
    // Cards last reviewed 30 days ago (so they have genuinely decayed), with the
    // exam 7 days out. Increasing stability => higher current exam-day R => less
    // to gain from another review.
    const now = 30 * MS_PER_DAY;
    const deck = makeDeck({ examDate: now + 7 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const stabilities = [1, 3, 10, 50, 200, 1000, 100_000];
    const deltas = stabilities.map((stability) =>
      deltaR(
        makeCard({ stability, difficulty: 5, lastReviewed: 0, state: 2, reps: 1 }),
        deck.examDate,
        now,
        ctx,
      ),
    );
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1] + 1e-9);
    }
    // The most stable card is essentially already secured: negligible gain.
    expect(deltas[deltas.length - 1]).toBeLessThan(1e-3);
    expect(deltas[deltas.length - 1]).toBeGreaterThanOrEqual(0);
  });

  it('on exam day a review leaves the card at R = 1.0', () => {
    const deck = makeDeck({ examDate: 5 * MS_PER_DAY });
    const ctx = simContext(deck, makeEngine(deck.fsrsParameters));
    const now = deck.examDate; // no time remaining
    const card = makeCard({ stability: 2, difficulty: 5, lastReviewed: 0 });
    expect(
      rAtExamIfReviewedNow(card, ctx.expectedGrade, deck.examDate, now, ctx),
    ).toBe(1.0);
  });
});
