import { describe, expect, it } from 'vitest';
import { type Card } from '../db/types';
import { MS_PER_DAY } from './params';
import { applyReview, makeEngine } from './fsrs';
import {
  makeSessionContext,
  sessionComplete,
  sessionCompletionProgress,
  sessionProgress,
} from './session';
import { NOW, deck, card } from './session.testFixtures';

describe('single and multi-unit completion paths', () => {
  it('treats an empty single-unit session as incomplete with full progress', () => {
    const ctx = makeSessionContext([deck('empty', 10)]);

    expect(sessionComplete([], ctx, NOW)).toBe(false);
    expect(sessionProgress([], ctx, NOW)).toBe(1);
  });

  it('completes a multi-unit secured-topics session when every card is secure', () => {
    const first = { ...deck('first', 1), examObjective: 'securedTopics' as const };
    const second = { ...deck('second', 1), examObjective: 'securedTopics' as const };
    const cards = [
      card('first-card', first.id, {
        stability: 10_000,
        difficulty: 5,
        lastReviewed: NOW,
        reps: 1,
        state: 2,
      }),
      card('second-card', second.id, {
        stability: 10_000,
        difficulty: 5,
        lastReviewed: NOW,
        reps: 1,
        state: 2,
      }),
    ];
    const ctx = makeSessionContext([first, second]);

    expect(sessionComplete(cards, ctx, NOW)).toBe(true);
    expect(sessionProgress(cards, ctx, NOW)).toBe(1);
    expect(sessionProgress([], ctx, NOW)).toBe(1);
  });
});

describe('session completion progress', () => {
  const unit = deck('unit', 30);
  const engine = makeEngine(unit.fsrsParameters);
  const review = (target: Card, grade: 1 | 2 | 3, at = NOW): Card => ({
    ...target,
    ...applyReview(engine, target, grade, at).memory,
  });
  const due = (id: string) =>
    card(id, unit.id, {
      state: 2,
      stability: 3,
      difficulty: 5,
      reps: 4,
      lastReviewed: NOW - 4 * MS_PER_DAY,
      due: NOW - 1,
    });
  const start = () => {
    const cards = [due('a'), due('b'), due('c'), due('d')];
    return { cards, ctx: makeSessionContext([unit], 'due', cards) };
  };
  const swap = (cards: Card[], next: Card) => cards.map((c) => (c.id === next.id ? next : c));

  it('counts a card once it is answered, whatever the grade', () => {
    const { cards, ctx } = start();
    const failed = swap(cards, review(cards[0], 1));
    expect(sessionCompletionProgress(failed, ctx, new Map([['a', 'wrong']]), NOW)).toBe(0.25);
    const hard = swap(cards, review(cards[0], 2));
    expect(sessionCompletionProgress(hard, ctx, new Map([['a', 'correct']]), NOW)).toBe(0.25);
  });

  it("does not move backwards when a failed card's retry falls due", () => {
    const { cards, ctx } = start();
    const failed = review(cards[0], 1);
    const afterFail = swap(cards, failed);
    const wrong = new Map([['a', 'wrong' as const]]);
    const retryDue = (failed.due ?? NOW) + 1;
    expect(sessionCompletionProgress(afterFail, ctx, wrong, NOW)).toBe(0.25);
    expect(sessionCompletionProgress(afterFail, ctx, wrong, retryDue)).toBe(0.25);
    const retried = swap(afterFail, review(failed, 3, retryDue));
    expect(sessionCompletionProgress(retried, ctx, new Map([['a', 'correct']]), retryDue)).toBe(
      0.25,
    );
  });

  it('is unaffected by rolling time while nothing is answered', () => {
    const { cards, ctx } = start();
    expect(sessionCompletionProgress(cards, ctx, new Map(), NOW)).toBe(0);
    expect(sessionCompletionProgress(cards, ctx, new Map(), NOW + 3 * MS_PER_DAY)).toBe(0);
  });

  it('clears suspended and buried cards and ignores cards admitted later', () => {
    const { cards, ctx } = start();
    const changed = [
      { ...cards[0], suspended: true },
      { ...cards[1], buriedUntil: NOW + MS_PER_DAY },
      cards[2],
      cards[3],
      due('late'),
    ];
    expect(sessionCompletionProgress(changed, ctx, new Map(), NOW)).toBe(0.5);
  });
});
