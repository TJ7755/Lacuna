export interface RevisionSessionState {
  covered: Set<string>;
  improved: Set<string>;
  parked: Set<string>;
  completed: Set<string>;
  retryAt: Map<string, number>;
  failures: Map<string, number>;
  reviewEventIds: string[];
}

export function createRevisionSessionState(): RevisionSessionState {
  return {
    covered: new Set(),
    improved: new Set(),
    parked: new Set(),
    completed: new Set(),
    retryAt: new Map(),
    failures: new Map(),
    reviewEventIds: [],
  };
}

export function snapshotRevisionSessionState(state: RevisionSessionState): RevisionSessionState {
  return {
    covered: new Set(state.covered),
    improved: new Set(state.improved),
    parked: new Set(state.parked),
    completed: new Set(state.completed),
    retryAt: new Map(state.retryAt),
    failures: new Map(state.failures),
    reviewEventIds: [...state.reviewEventIds],
  };
}

export function transitionRevisionAnswer(
  state: RevisionSessionState,
  input: {
    cardId: string;
    correct: boolean;
    now: number;
    productiveAt: number;
    windowEndsAt: number;
  },
): RevisionSessionState {
  const next: RevisionSessionState = {
    covered: new Set(state.covered).add(input.cardId),
    improved: new Set(state.improved),
    parked: new Set(state.parked),
    completed: new Set(state.completed),
    retryAt: new Map(state.retryAt),
    failures: new Map(state.failures),
    reviewEventIds: state.reviewEventIds,
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
