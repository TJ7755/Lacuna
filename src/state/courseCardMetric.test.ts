import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readCourseCardMetric,
  useCourseCardMetric,
  writeCourseCardMetric,
} from './courseCardMetric';

const KEY = 'lacuna.courseCardMetric';

beforeEach(() => {
  localStorage.clear();
});

describe('course card metric preference', () => {
  it('defaults invalid or missing values to curriculum progress', () => {
    expect(readCourseCardMetric()).toBe('curriculum');
    localStorage.setItem(KEY, 'nonsense');
    expect(readCourseCardMetric()).toBe('curriculum');
  });

  it('persists valid values', () => {
    writeCourseCardMetric('coverage');
    expect(readCourseCardMetric()).toBe('coverage');
  });

  it('updates through the hook', () => {
    const { result } = renderHook(() => useCourseCardMetric());
    act(() => result.current[1]('today'));
    expect(result.current[0]).toBe('today');
    expect(localStorage.getItem(KEY)).toBe('today');
  });
});
