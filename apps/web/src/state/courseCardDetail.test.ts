import { describe, expect, it, beforeEach } from 'vitest';
import {
  readCourseCardDetail,
  writeCourseCardDetail,
  useCourseCardDetail,
  DEFAULTS,
} from './courseCardDetail';
import { renderHook, act } from '@testing-library/react';

const KEY = 'lacuna.courseCardDetail';

beforeEach(() => {
  localStorage.clear();
});

describe('readCourseCardDetail', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readCourseCardDetail()).toEqual(DEFAULTS);
  });

  it('merges stored values over defaults', () => {
    localStorage.setItem(KEY, JSON.stringify({ activity: false }));
    const settings = readCourseCardDetail();
    expect(settings.activity).toBe(false);
    expect(settings.nextDue).toBe(DEFAULTS.nextDue);
    expect(settings.breakdown).toBe(DEFAULTS.breakdown);
  });

  it('falls back to defaults on invalid JSON', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(readCourseCardDetail()).toEqual(DEFAULTS);
  });
});

describe('writeCourseCardDetail', () => {
  it('persists a partial patch on top of the current settings', () => {
    writeCourseCardDetail({ breakdown: false });
    writeCourseCardDetail({ nextDue: false });
    const settings = readCourseCardDetail();
    expect(settings.breakdown).toBe(false);
    expect(settings.nextDue).toBe(false);
    expect(settings.activity).toBe(true);
  });
});

describe('useCourseCardDetail', () => {
  it('returns the current settings and a setter', () => {
    const { result } = renderHook(() => useCourseCardDetail());
    expect(result.current[0]).toEqual(DEFAULTS);
    act(() => {
      result.current[1]({ activity: false });
    });
    expect(result.current[0].activity).toBe(false);
    expect(readCourseCardDetail().activity).toBe(false);
  });

  it('reacts to changes made elsewhere via the custom event', () => {
    const { result } = renderHook(() => useCourseCardDetail());
    act(() => {
      writeCourseCardDetail({ nextDue: false });
    });
    expect(result.current[0].nextDue).toBe(false);
  });
});
