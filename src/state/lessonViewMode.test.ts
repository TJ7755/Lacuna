import { describe, expect, it, beforeEach } from 'vitest';
import {
  readLessonViewMode,
  writeLessonViewMode,
  useLessonViewMode,
} from './lessonViewMode';
import { renderHook, act } from '@testing-library/react';

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

describe('writeLessonViewMode', () => {
  it('persists the value to localStorage and dispatches an event', () => {
    let received: string | undefined;
    window.addEventListener('lacuna:lesson-view-mode', (e) => {
      received = (e as CustomEvent<string>).detail;
    });

    writeLessonViewMode('edit');

    expect(localStorage.getItem(KEY)).toBe('edit');
    expect(received).toBe('edit');
  });
});

describe('useLessonViewMode', () => {
  it('returns the current value and a setter', () => {
    const { result } = renderHook(() => useLessonViewMode());
    expect(result.current[0]).toBe('study');
    act(() => {
      result.current[1]('edit');
    });
    expect(result.current[0]).toBe('edit');
    expect(localStorage.getItem(KEY)).toBe('edit');
  });
});
