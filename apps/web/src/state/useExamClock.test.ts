import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExamClock } from './useExamClock';

afterEach(() => vi.useRealTimers());

it('refreshes at equality, then schedules the next upcoming deadline without writes', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { result, unmount } = renderHook(() => useExamClock([900, 1100, 1300]));
  expect(result.current).toBe(1000);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toBe(1100);
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(1300);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('reschedules when dates change and refreshes ordinary time at least once a minute', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { result, rerender, unmount } = renderHook(({ dates }) => useExamClock(dates), {
    initialProps: { dates: [2000] },
  });
  rerender({ dates: [1200] });
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(1200);
  act(() => vi.advanceTimersByTime(60_000));
  expect(result.current).toBe(61_200);
  unmount();
});
