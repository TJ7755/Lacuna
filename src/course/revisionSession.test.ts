import { describe, expect, it } from 'vitest';
import {
  createRevisionSessionState,
  snapshotRevisionSessionState,
  transitionRevisionAnswer,
} from './revisionSession';

describe('revision session', () => {
  it('keeps undo evidence independent of later session work and restores the retry history', () => {
    const live = transitionRevisionAnswer(createRevisionSessionState(), {
      cardId: 'card-1',
      correct: false,
      now: 100,
      productiveAt: 120,
      windowEndsAt: 200,
    });
    live.reviewEventIds.push('review-1');
    const saved = snapshotRevisionSessionState(live);

    live.covered.add('card-2');
    live.improved.add('card-2');
    live.parked.add('card-1');
    live.completed.add('card-2');
    live.retryAt.set('card-1', 160);
    live.failures.set('card-1', 2);
    live.reviewEventIds.push('review-2');

    expect(saved).toEqual({
      covered: new Set(['card-1']),
      improved: new Set(),
      parked: new Set(),
      completed: new Set(),
      retryAt: new Map([['card-1', 120]]),
      failures: new Map([['card-1', 1]]),
      reviewEventIds: ['review-1'],
    });
    const restored = transitionRevisionAnswer(saved, {
      cardId: 'card-1',
      correct: false,
      now: 130,
      productiveAt: 150,
      windowEndsAt: 200,
    });
    expect(restored.failures.get('card-1')).toBe(2);
    expect(restored.parked).toEqual(new Set(['card-1']));
    expect(restored.retryAt.has('card-1')).toBe(false);
    expect(restored.reviewEventIds).toEqual(['review-1']);
  });

  it('retries one revision failure when productive, then parks a second failure', () => {
    const initial = {
      covered: new Set<string>(),
      improved: new Set<string>(),
      parked: new Set<string>(),
      completed: new Set<string>(),
      retryAt: new Map<string, number>(),
      failures: new Map<string, number>(),
      reviewEventIds: [],
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
        reviewEventIds: [],
      },
      { cardId: 'card-1', correct: true, now: 130, productiveAt: 130, windowEndsAt: 200 },
    );
    expect(next.covered).toEqual(new Set(['card-1']));
    expect(next.improved).toEqual(new Set(['card-1']));
    expect(next.completed).toEqual(new Set(['card-1']));
    expect(next.retryAt.has('card-1')).toBe(false);
  });
});
