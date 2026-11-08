import { describe, expect, it, beforeEach } from 'vitest';
import {
  readPracticeDefaults,
  usePracticeDefaults,
  type PracticeDefaults,
} from './practiceDefaults';
import { renderHook, act } from '@testing-library/react';

const KEY = 'lacuna.practiceDefaults';

const FALLBACK: PracticeDefaults = {
  autoPractice: true,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 14,
  practiceMaxGap: 2,
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

it('saves a changed practice default under the existing key', () => {
  const { result } = renderHook(usePracticeDefaults);
  const changed = { ...FALLBACK, practiceUrgentWindowDays: 21 };
  act(() => result.current[1](changed));
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(changed);
});
