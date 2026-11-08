import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useCourseCardDetail } from './courseCardDetail';

const key = 'lacuna.courseCardDetail';
beforeEach(() => localStorage.clear());

it.each([null, 'not-json'])('uses the card detail defaults for %j', (stored) => {
  if (stored !== null) localStorage.setItem(key, stored);
  expect(renderHook(useCourseCardDetail).result.current[0]).toEqual({
    nextDue: true,
    breakdown: true,
    activity: true,
  });
});

it('keeps other details when patching a saved preference twice', () => {
  localStorage.setItem(key, '{"activity":false}');
  const { result } = renderHook(useCourseCardDetail);
  expect(result.current[0]).toEqual({ nextDue: true, breakdown: true, activity: false });
  act(() => {
    result.current[1]({ breakdown: false });
    result.current[1]({ nextDue: false });
  });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
    nextDue: false,
    breakdown: false,
    activity: false,
  });
});
