import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearActiveStudyFlow,
  readActiveStudyFlow,
  startActiveStudyFlow,
  touchActiveStudyFlow,
} from './activeStudyFlow';

const STORAGE_KEY = 'lacuna.activeStudyFlow';

beforeEach(() => localStorage.clear());

describe('active study flow identity', () => {
  it('stores only the active course identity and timestamps', () => {
    expect(startActiveStudyFlow('course-1', 100)).toEqual({
      courseId: 'course-1',
      startedAt: 100,
      lastActiveAt: 100,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      courseId: 'course-1',
      startedAt: 100,
      lastActiveAt: 100,
    });
  });

  it('updates activity without changing the start time', () => {
    startActiveStudyFlow('course-1', 100);
    expect(touchActiveStudyFlow('course-1', 250)).toEqual({
      courseId: 'course-1',
      startedAt: 100,
      lastActiveAt: 250,
    });
  });

  it('does not touch another course or move activity before the start time', () => {
    startActiveStudyFlow('course-1', 100);
    expect(touchActiveStudyFlow('course-2', 250)).toBeNull();
    expect(touchActiveStudyFlow('course-1', 50)).toBeNull();
    expect(readActiveStudyFlow()?.lastActiveAt).toBe(100);
  });

  it.each([
    'not json',
    JSON.stringify({ courseId: '', startedAt: 1, lastActiveAt: 1 }),
    JSON.stringify({ courseId: 'course-1', startedAt: -1, lastActiveAt: 1 }),
    JSON.stringify({ courseId: 'course-1', startedAt: 2, lastActiveAt: 1 }),
    JSON.stringify({ courseId: 'course-1', startedAt: 1, lastActiveAt: 1, queue: [] }),
  ])('rejects malformed or expanded persisted state: %s', (raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    expect(readActiveStudyFlow()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears the persisted identity', () => {
    startActiveStudyFlow('course-1', 100);
    clearActiveStudyFlow();
    expect(readActiveStudyFlow()).toBeNull();
  });
});
