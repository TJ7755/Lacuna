import type { Card } from '../db/types';
import type { SessionCardOutcome } from './sessionSummary';

export interface SimpleSessionState {
  queue: Card[];
  mastered: Set<string>;
  wrong: Set<string>;
  outcomes: Map<string, SessionCardOutcome>;
}

export function transitionSimpleAnswer(
  state: SimpleSessionState,
  card: Card,
  correct: boolean,
): SimpleSessionState {
  const mastered = new Set(state.mastered);
  const wrong = new Set(state.wrong);
  const outcomes = new Map(state.outcomes);
  let queue = state.queue;

  if (card.suspended) {
    mastered.delete(card.id);
    wrong.delete(card.id);
    outcomes.delete(card.id);
    queue = queue.filter((candidate) => candidate.id !== card.id);
    return { queue, mastered, wrong, outcomes };
  }

  if (correct) {
    mastered.add(card.id);
    wrong.delete(card.id);
  } else {
    wrong.add(card.id);
    queue = [...state.queue.filter((candidate) => candidate.id !== card.id), card];
  }
  outcomes.set(card.id, correct ? 'correct' : 'wrong');
  return { queue, mastered, wrong, outcomes };
}
