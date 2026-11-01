import type { SessionState } from './sessionMachine';
import { createRevisionSessionState } from '../../course/revisionSession';

export interface Cell<T> {
  current: T;
}

export function emptySessionState(): SessionState {
  const outcomes: SessionState['outcomes'] = new Map();
  return {
    cards: [],
    cardIds: [],
    events: [],
    outcomes,
    cooldowns: new Map(),
    revision: createRevisionSessionState(),
    simple: { queue: [], mastered: new Set(), wrong: new Set(), outcomes },
  };
}

/** Mutable adapters read the same state that transitions replace, including after awaits. */
export function sessionCell<K extends keyof SessionState>(
  owner: Cell<SessionState>,
  key: K,
): Cell<SessionState[K]> {
  return {
    get current() {
      return owner.current[key];
    },
    set current(value) {
      owner.current = { ...owner.current, [key]: value };
      if (key === 'outcomes')
        owner.current.simple = { ...owner.current.simple, outcomes: owner.current.outcomes };
    },
  };
}
export function simpleSessionCell<K extends keyof SessionState['simple']>(
  owner: Cell<SessionState>,
  key: K,
): Cell<SessionState['simple'][K]> {
  return {
    get current() {
      return owner.current.simple[key];
    },
    set current(value) {
      owner.current = { ...owner.current, simple: { ...owner.current.simple, [key]: value } };
    },
  };
}
