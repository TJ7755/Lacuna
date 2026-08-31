import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionEvent } from '../../components/learn/types';
import {
  clearSimpleSession,
  loadSimpleSession,
  saveSimpleSession,
  simpleSessionStorageKey,
  type SimpleSessionScope,
} from './simpleSessionPersistence';

const scope: SimpleSessionScope = {
  kind: 'lesson',
  lessonId: 'lesson-1',
};

const events: SessionEvent[] = [
  { grade: 1, correct: false, responseTimeSec: 4, distracted: false },
  { grade: 3, correct: true, responseTimeSec: 2, distracted: true },
];

beforeEach(() => localStorage.clear());

describe('Simple session persistence', () => {
  it('round-trips a versioned ID-only session snapshot', () => {
    saveSimpleSession(scope, {
      queueCardIds: ['card-2', 'card-1'],
      masteredCardIds: ['card-1'],
      outcomes: [
        ['card-1', 'correct'],
        ['card-2', 'wrong'],
      ],
      events,
    });

    expect(JSON.parse(localStorage.getItem(simpleSessionStorageKey(scope))!)).toEqual({
      version: 1,
      queueCardIds: ['card-2', 'card-1'],
      masteredCardIds: ['card-1'],
      outcomes: [
        ['card-1', 'correct'],
        ['card-2', 'wrong'],
      ],
      events,
    });
    expect(loadSimpleSession(scope, ['card-1', 'card-2'])).toEqual({
      queueCardIds: ['card-2', 'card-1'],
      masteredCardIds: ['card-1'],
      outcomes: new Map([
        ['card-1', 'correct'],
        ['card-2', 'wrong'],
      ]),
      events,
    });
  });

  it('reconciles a saved pass with the current eligible card IDs', () => {
    saveSimpleSession(scope, {
      queueCardIds: ['removed', 'card-2'],
      masteredCardIds: ['removed', 'card-1'],
      outcomes: [
        ['removed', 'wrong'],
        ['card-1', 'correct'],
      ],
      events,
    });

    expect(loadSimpleSession(scope, ['card-1', 'card-2', 'card-3'])).toEqual({
      queueCardIds: ['card-2', 'card-1', 'card-3'],
      masteredCardIds: ['card-1'],
      outcomes: new Map([['card-1', 'correct']]),
      events,
    });
  });

  it('rejects corrupt or differently versioned snapshots and can clear a scope', () => {
    localStorage.setItem(simpleSessionStorageKey(scope), '{broken');
    expect(loadSimpleSession(scope, ['card-1'])).toBeNull();
    expect(localStorage.getItem(simpleSessionStorageKey(scope))).toBeNull();

    localStorage.setItem(
      simpleSessionStorageKey(scope),
      JSON.stringify({ version: 2, queueCardIds: [] }),
    );
    expect(loadSimpleSession(scope, ['card-1'])).toBeNull();

    saveSimpleSession(scope, {
      queueCardIds: ['card-1'],
      masteredCardIds: [],
      outcomes: [],
      events: [],
    });
    clearSimpleSession(scope);
    expect(localStorage.getItem(simpleSessionStorageKey(scope))).toBeNull();
  });

  it('separates lesson, course, filtered and embedded-flow scopes', () => {
    const keys = [
      simpleSessionStorageKey(scope),
      simpleSessionStorageKey({ kind: 'course', courseId: 'course-1', filters: ['due'] }),
      simpleSessionStorageKey({ kind: 'global', filters: ['new'], tag: 'core' }),
      simpleSessionStorageKey({
        kind: 'practice',
        courseId: 'course-1',
        sessionId: 'flow-1',
        nodeKey: 'node-1',
        lessonIds: ['lesson-2', 'lesson-1'],
      }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});
