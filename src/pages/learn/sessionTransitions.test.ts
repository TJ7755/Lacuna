import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/types';
import { transitionRevisionAnswer, transitionSimpleAnswer } from './sessionTransitions';

const card = { id: 'card-1' } as Card;

describe('session transitions', () => {
  it('moves a failed Simple card to the queue tail and masters it after a correct retry', () => {
    const other = { id: 'card-2' } as Card;
    const initial = {
      queue: [card, other],
      mastered: new Set<string>(),
      wrong: new Set<string>(),
      outcomes: new Map(),
    };
    const failed = transitionSimpleAnswer(initial, card, false);
    expect(failed.queue.map(({ id }) => id)).toEqual(['card-2', 'card-1']);
    expect(failed.wrong).toEqual(new Set(['card-1']));
    expect(failed.outcomes.get('card-1')).toBe('wrong');

    const corrected = transitionSimpleAnswer(failed, card, true);
    expect(corrected.mastered).toEqual(new Set(['card-1']));
    expect(corrected.wrong).toEqual(new Set());
    expect(corrected.outcomes.get('card-1')).toBe('correct');
    expect(initial.wrong).toEqual(new Set());
  });

  it('retries one revision failure when productive, then parks a second failure', () => {
    const initial = {
      covered: new Set<string>(),
      improved: new Set<string>(),
      parked: new Set<string>(),
      completed: new Set<string>(),
      retryAt: new Map<string, number>(),
      failures: new Map<string, number>(),
    };
    const first = transitionRevisionAnswer(initial, {
      cardId: 'card-1',
      correct: false,
      now: 100,
      productiveAt: 120,
      windowEndsAt: 200,
    });
    expect(first.retryAt.get('card-1')).toBe(120);
    expect(first.parked).toEqual(new Set());

    const second = transitionRevisionAnswer(first, {
      cardId: 'card-1',
      correct: false,
      now: 130,
      productiveAt: 150,
      windowEndsAt: 200,
    });
    expect(second.retryAt.has('card-1')).toBe(false);
    expect(second.parked).toEqual(new Set(['card-1']));
    expect(first.parked).toEqual(new Set());
  });

  it('completes and improves a revision card while clearing its retry', () => {
    const next = transitionRevisionAnswer(
      {
        covered: new Set(),
        improved: new Set(),
        parked: new Set(),
        completed: new Set(),
        retryAt: new Map([['card-1', 120]]),
        failures: new Map([['card-1', 1]]),
      },
      { cardId: 'card-1', correct: true, now: 130, productiveAt: 130, windowEndsAt: 200 },
    );
    expect(next.covered).toEqual(new Set(['card-1']));
    expect(next.improved).toEqual(new Set(['card-1']));
    expect(next.completed).toEqual(new Set(['card-1']));
    expect(next.retryAt.has('card-1')).toBe(false);
  });
});
