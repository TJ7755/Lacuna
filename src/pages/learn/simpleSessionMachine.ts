import type { Card } from '../../db/types';
import { transitionSimpleAnswer, type SimpleSessionState } from '../../course/simpleSession';

export type SimpleSessionEffect =
  { type: 'persist-resume' } | { type: 'finish'; completed: boolean } | { type: 'serve-next' };

export interface SimpleSessionTransition {
  state: SimpleSessionState;
  effects: SimpleSessionEffect[];
}

/** Receives the persisted card: failed writes must never advance the queue. */
export function advanceSimpleSession(
  state: SimpleSessionState,
  event: { type: 'answer-recorded'; card: Card; correct: boolean },
): SimpleSessionTransition {
  const updated = {
    ...state,
    queue: state.queue.map((card) => (card.id === event.card.id ? event.card : card)),
  };
  const next = transitionSimpleAnswer(updated, event.card, event.correct);
  const remaining = next.queue.some((card) => !next.mastered.has(card.id));
  return {
    state: next,
    effects: [
      { type: 'persist-resume' },
      remaining ? { type: 'serve-next' } : { type: 'finish', completed: !event.card.suspended },
    ],
  };
}
