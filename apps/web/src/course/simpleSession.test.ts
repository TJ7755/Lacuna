import { describe, expect, it } from 'vitest';
import type { Card } from '../db/types';
import { transitionSimpleAnswer } from './simpleSession';

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
});
