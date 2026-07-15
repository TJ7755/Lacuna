import { describe, expect, it, beforeEach } from 'vitest';
import { readLessonViewMode } from './lessonViewMode';

const KEY = 'lacuna.lessonViewMode';

beforeEach(() => {
  localStorage.clear();
});

describe('readLessonViewMode', () => {
  it('defaults to study when nothing is stored', () => {
    expect(readLessonViewMode()).toBe('study');
  });

  it('returns the stored mode', () => {
    localStorage.setItem(KEY, 'edit');
    expect(readLessonViewMode()).toBe('edit');
  });

  it('falls back to study on an invalid stored value', () => {
    localStorage.setItem(KEY, 'nonsense');
    expect(readLessonViewMode()).toBe('study');
  });
});
