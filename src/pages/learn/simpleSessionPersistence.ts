import type { SessionEvent } from '../../components/learn/types';
import type { SessionCardOutcome } from './types';

const STORAGE_PREFIX = 'lacuna.simpleSession.v1:';

export type SimpleSessionScope =
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'course'; courseId: string; filters?: string[]; tag?: string }
  | { kind: 'global'; filters?: string[]; tag?: string }
  | {
      kind: 'practice';
      courseId: string;
      sessionId?: string;
      nodeKey?: string;
      lessonIds?: string[];
      assessmentId?: string;
      planId?: string;
      windowId?: string;
    };

interface StoredSimpleSession {
  version: 1;
  queueCardIds: string[];
  masteredCardIds: string[];
  outcomes: [string, SessionCardOutcome][];
  events: SessionEvent[];
}

export interface SimpleSessionSnapshot {
  queueCardIds: string[];
  masteredCardIds: string[];
  outcomes: Map<string, SessionCardOutcome>;
  events: SessionEvent[];
}

export interface SaveSimpleSessionInput {
  queueCardIds: string[];
  masteredCardIds: string[];
  outcomes: Iterable<readonly [string, SessionCardOutcome]>;
  events: SessionEvent[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalisedScope(scope: SimpleSessionScope): unknown {
  switch (scope.kind) {
    case 'lesson':
      return scope;
    case 'course':
      return {
        kind: scope.kind,
        courseId: scope.courseId,
        filters: [...(scope.filters ?? [])].sort(),
        tag: scope.tag ?? null,
      };
    case 'global':
      return {
        kind: scope.kind,
        filters: [...(scope.filters ?? [])].sort(),
        tag: scope.tag ?? null,
      };
    case 'practice':
      return {
        kind: scope.kind,
        courseId: scope.courseId,
        sessionId: scope.sessionId ?? null,
        nodeKey: scope.nodeKey ?? null,
        lessonIds: [...(scope.lessonIds ?? [])].sort(),
        assessmentId: scope.assessmentId ?? null,
        planId: scope.planId ?? null,
        windowId: scope.windowId ?? null,
      };
  }
}

export function simpleSessionStorageKey(scope: SimpleSessionScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(JSON.stringify(normalisedScope(scope)))}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOutcomeEntries(value: unknown): value is [string, SessionCardOutcome][] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        (entry[1] === 'correct' || entry[1] === 'wrong'),
    )
  );
}

function isEvents(value: unknown): value is SessionEvent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as SessionEvent).correct === ((event as SessionEvent).correct ? true : false) &&
        typeof (event as SessionEvent).grade === 'number' &&
        typeof (event as SessionEvent).responseTimeSec === 'number' &&
        Number.isFinite((event as SessionEvent).responseTimeSec) &&
        typeof (event as SessionEvent).distracted === 'boolean',
    )
  );
}

function parseStored(value: unknown): StoredSimpleSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const stored = value as Partial<StoredSimpleSession>;
  if (
    stored.version !== 1 ||
    !isStringArray(stored.queueCardIds) ||
    !isStringArray(stored.masteredCardIds) ||
    !isOutcomeEntries(stored.outcomes) ||
    !isEvents(stored.events)
  ) {
    return null;
  }
  return stored as StoredSimpleSession;
}

export function saveSimpleSession(scope: SimpleSessionScope, input: SaveSimpleSessionInput): void {
  const stored: StoredSimpleSession = {
    version: 1,
    queueCardIds: unique(input.queueCardIds),
    masteredCardIds: unique(input.masteredCardIds),
    outcomes: [...input.outcomes].map(([cardId, outcome]) => [cardId, outcome]),
    events: input.events,
  };
  try {
    localStorage.setItem(simpleSessionStorageKey(scope), JSON.stringify(stored));
  } catch {
    // Resume is a convenience. A storage quota or privacy setting must not stop study.
  }
}

export function loadSimpleSession(
  scope: SimpleSessionScope,
  eligibleCardIds: string[],
): SimpleSessionSnapshot | null {
  const key = simpleSessionStorageKey(scope);
  let stored: StoredSimpleSession | null = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    stored = parseStored(JSON.parse(raw));
  } catch {
    stored = null;
  }
  if (!stored) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing useful can be done if storage is unavailable.
    }
    return null;
  }

  const eligible = new Set(eligibleCardIds);
  const masteredCardIds = unique(stored.masteredCardIds).filter((id) => eligible.has(id));
  const queueCardIds = unique(stored.queueCardIds).filter((id) => eligible.has(id));
  const queued = new Set(queueCardIds);
  for (const cardId of eligibleCardIds) {
    if (!queued.has(cardId)) queueCardIds.push(cardId);
  }
  const outcomes = new Map(stored.outcomes.filter(([cardId]) => eligible.has(cardId)));
  return { queueCardIds, masteredCardIds, outcomes, events: stored.events };
}

export function clearSimpleSession(scope: SimpleSessionScope): void {
  try {
    localStorage.removeItem(simpleSessionStorageKey(scope));
  } catch {
    // Nothing useful can be done if storage is unavailable.
  }
}
