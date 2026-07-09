import { describe, expect, it, beforeEach } from 'vitest';
import {
  readPracticeDefaults,
  writePracticeDefaults,
  usePracticeDefaults,
  type PracticeDefaults,
} from './practiceDefaults';
import { renderHook, act } from '@testing-library/react';

const KEY = 'lacuna.practiceDefaults';

const FALLBACK: PracticeDefaults = {
  autoPractice: true,
  practiceThresholdMinutesFar: 60,
  practiceThresholdMinutesNear: 30,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 5,
};

beforeEach(() => {
  localStorage.clear();
});

describe('readPracticeDefaults', () => {
  it('returns fallback defaults when nothing is stored', () => {
    expect(readPracticeDefaults()).toEqual(FALLBACK);
  });

  it('returns stored values merged over the fallback', () => {
    localStorage.setItem(KEY, JSON.stringify({ practiceMaxGap: 10 }));
    expect(readPracticeDefaults()).toEqual({ ...FALLBACK, practiceMaxGap: 10 });
  });

  it('falls back to defaults on invalid JSON', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readPracticeDefaults()).toEqual(FALLBACK);
  });
});

describe('writePracticeDefaults', () => {
  it('persists the value to localStorage and dispatches an event', () => {
    let received: PracticeDefaults | undefined;
    window.addEventListener('lacuna:practice-defaults', (e) => {
      received = (e as CustomEvent<PracticeDefaults>).detail;
    });

    const next = { ...FALLBACK, autoPractice: false };
    writePracticeDefaults(next);

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(next);
    expect(received).toEqual(next);
  });
});

describe('usePracticeDefaults', () => {
  it('returns the current value and a setter', () => {
    const { result } = renderHook(() => usePracticeDefaults());
    expect(result.current[0]).toEqual(FALLBACK);
    act(() => {
      result.current[1]({ ...FALLBACK, practiceUrgentWindowDays: 14 });
    });
    expect(result.current[0]).toEqual({ ...FALLBACK, practiceUrgentWindowDays: 14 });
    expect(JSON.parse(localStorage.getItem(KEY)!).practiceUrgentWindowDays).toBe(14);
  });
});
