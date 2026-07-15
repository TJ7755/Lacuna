import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStartInFocusMode,
  useStartInFocusMode,
  writeStartInFocusMode,
} from './focusModePreference';

const KEY = 'lacuna.startInFocusMode';
const CHANGE_EVENT = 'lacuna:start-in-focus-mode';

beforeEach(() => {
  localStorage.clear();
});

describe('readStartInFocusMode', () => {
  it('defaults to false when nothing is stored', () => {
    expect(readStartInFocusMode()).toBe(false);
  });

  it('returns true only when on is stored', () => {
    localStorage.setItem(KEY, 'on');
    expect(readStartInFocusMode()).toBe(true);

    localStorage.setItem(KEY, 'invalid');
    expect(readStartInFocusMode()).toBe(false);
  });
});

describe('writeStartInFocusMode', () => {
  it('persists the preference', () => {
    writeStartInFocusMode(true);
    expect(localStorage.getItem(KEY)).toBe('on');

    writeStartInFocusMode(false);
    expect(localStorage.getItem(KEY)).toBe('off');
  });

  it('dispatches the same-window change event', () => {
    let detail: boolean | null = null;
    const handler = (event: Event) => {
      detail = (event as CustomEvent<boolean>).detail;
    };
    window.addEventListener(CHANGE_EVENT, handler);

    writeStartInFocusMode(true);

    window.removeEventListener(CHANGE_EVENT, handler);
    expect(detail).toBe(true);
  });
});

describe('useStartInFocusMode', () => {
  it('returns the current preference and a setter', () => {
    const { result } = renderHook(() => useStartInFocusMode());
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('on');
  });

  it('synchronises changes made in the same window', () => {
    const { result } = renderHook(() => useStartInFocusMode());

    act(() => {
      writeStartInFocusMode(true);
    });

    expect(result.current[0]).toBe(true);
  });

  it('synchronises changes received through the storage event', () => {
    const { result } = renderHook(() => useStartInFocusMode());
    localStorage.setItem(KEY, 'on');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });

    expect(result.current[0]).toBe(true);
  });
});
