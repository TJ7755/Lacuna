import type { Card } from '../../db/types';
import type { SessionCardOutcome } from './types';

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

export interface RevisionTransitionState {
  covered: Set<string>;
  improved: Set<string>;
  parked: Set<string>;
  completed: Set<string>;
  retryAt: Map<string, number>;
  failures: Map<string, number>;
}

export function transitionRevisionAnswer(
  state: RevisionTransitionState,
  input: {
    cardId: string;
    correct: boolean;
    now: number;
    productiveAt: number;
    windowEndsAt: number;
  },
): RevisionTransitionState {
  const next: RevisionTransitionState = {
    covered: new Set(state.covered).add(input.cardId),
    improved: new Set(state.improved),
    parked: new Set(state.parked),
    completed: new Set(state.completed),
    retryAt: new Map(state.retryAt),
    failures: new Map(state.failures),
  };
  if (input.correct) {
    next.improved.add(input.cardId);
    next.completed.add(input.cardId);
    next.retryAt.delete(input.cardId);
    return next;
  }

  const failures = (next.failures.get(input.cardId) ?? 0) + 1;
  next.failures.set(input.cardId, failures);
  if (failures >= 2 || input.productiveAt >= input.windowEndsAt) {
    next.parked.add(input.cardId);
    next.retryAt.delete(input.cardId);
  } else {
    next.retryAt.set(input.cardId, Math.max(input.now, input.productiveAt));
  }
  return next;
}
