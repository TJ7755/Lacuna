import { describe, expect, it, beforeEach } from 'vitest';
import {
  readAnswerStrictness,
  writeAnswerStrictness,
  useAnswerStrictness,
  answerComparisonOptions,
} from './answerStrictness';
import { renderHook, act } from '@testing-library/react';

const KEY = 'lacuna.answerStrictness';

beforeEach(() => {
  localStorage.clear();
});

describe('readAnswerStrictness', () => {
  it('returns lenient when nothing is stored', () => {
    expect(readAnswerStrictness()).toBe('lenient');
  });

  it('returns standard when stored', () => {
    localStorage.setItem(KEY, 'standard');
    expect(readAnswerStrictness()).toBe('standard');
  });

  it('returns exact when stored', () => {
    localStorage.setItem(KEY, 'exact');
    expect(readAnswerStrictness()).toBe('exact');
  });

  it('returns lenient for any invalid value', () => {
    localStorage.setItem(KEY, 'something');
    expect(readAnswerStrictness()).toBe('lenient');
  });
});

describe('writeAnswerStrictness', () => {
  it('persists the level to localStorage', () => {
    writeAnswerStrictness('exact');
    expect(localStorage.getItem(KEY)).toBe('exact');
  });

  it('dispatches a custom event', () => {
    let detail: string | null = null;
    const handler = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener('lacuna:answer-strictness', handler);
    writeAnswerStrictness('standard');
    window.removeEventListener('lacuna:answer-strictness', handler);
    expect(detail).toBe('standard');
  });
});

describe('useAnswerStrictness', () => {
  it('returns the current level and a setter', () => {
    const { result } = renderHook(() => useAnswerStrictness());
    expect(result.current[0]).toBe('lenient');
    act(() => {
      result.current[1]('exact');
    });
    expect(result.current[0]).toBe('exact');
    expect(localStorage.getItem(KEY)).toBe('exact');
  });
});

describe('answerComparisonOptions', () => {
  it('ignores case and punctuation for lenient', () => {
    expect(answerComparisonOptions('lenient')).toEqual({
      ignoreCase: true,
      ignorePunctuation: true,
    });
  });

  it('ignores case only for standard', () => {
    expect(answerComparisonOptions('standard')).toEqual({
      ignoreCase: true,
      ignorePunctuation: false,
    });
  });

  it('ignores neither for exact', () => {
    expect(answerComparisonOptions('exact')).toEqual({
      ignoreCase: false,
      ignorePunctuation: false,
    });
  });
});
