import { describe, expect, it, beforeEach } from 'vitest';
import { readTypingSetting, writeTypingSetting, useTypingSetting } from './typingSetting';
import { renderHook, act } from '@testing-library/react';

const KEY = 'lacuna.typingSetting';

beforeEach(() => {
  localStorage.clear();
});

describe('readTypingSetting', () => {
  it('returns reveal when nothing is stored', () => {
    expect(readTypingSetting()).toBe('reveal');
  });

  it('returns type when stored', () => {
    localStorage.setItem(KEY, 'type');
    expect(readTypingSetting()).toBe('type');
  });

  it('returns reveal for any non-type value', () => {
    localStorage.setItem(KEY, 'something');
    expect(readTypingSetting()).toBe('reveal');
  });
});

describe('writeTypingSetting', () => {
  it('persists the mode to localStorage', () => {
    writeTypingSetting('type');
    expect(localStorage.getItem(KEY)).toBe('type');
  });

  it('dispatches a custom event', () => {
    let detail: string | null = null;
    const handler = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener('lacuna:typing-setting', handler);
    writeTypingSetting('type');
    window.removeEventListener('lacuna:typing-setting', handler);
    expect(detail).toBe('type');
  });
});

describe('useTypingSetting', () => {
  it('returns the current mode and a setter', () => {
    const { result } = renderHook(() => useTypingSetting());
    expect(result.current[0]).toBe('reveal');
    act(() => {
      result.current[1]('type');
    });
    expect(result.current[0]).toBe('type');
    expect(localStorage.getItem(KEY)).toBe('type');
  });
});
