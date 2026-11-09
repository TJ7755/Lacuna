import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExamClock } from './useExamClock';

afterEach(() => vi.useRealTimers());

it('refreshes at exam equality and the next deadline, then cleans up', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { result, unmount } = renderHook(() => useExamClock([900, 1100, 1300]));
  await act(() => vi.advanceTimersByTime(100));
  expect(result.current).toBe(1100);
  await act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(1300);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('reschedules changed dates without polling between boundaries', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { result, rerender, unmount } = renderHook(({ dates }) => useExamClock(dates), {
    initialProps: { dates: [2000] },
  });
  rerender({ dates: [1200] });
  await act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(1200);
  await act(() => vi.advanceTimersByTime(60_000));
  expect(result.current).toBe(1200);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('catches a boundary crossed between rendering and subscribing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { result } = renderHook(() => {
    const now = useExamClock([], [1001]);
    // Layout effects run after the snapshot is read but before the timer is armed.
    useLayoutEffect(() => {
      vi.setSystemTime(1002);
    }, []);
    return now;
  });
  await act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(1003);
});

it('refreshes at burial expiry and local midnight without database writes', async () => {
  vi.useFakeTimers();
  const start = new Date(2026, 10, 1, 23, 58).getTime();
  const midnight = new Date(2026, 10, 2).getTime();
  vi.setSystemTime(start);
  const { result, unmount } = renderHook(() => useExamClock([], [start + 30_000]));
  await act(() => vi.advanceTimersByTime(30_000));
  expect(result.current).toBe(start + 30_000);
  await act(() => vi.advanceTimersByTime(90_000));
  expect(result.current).toBe(midnight);
  await act(() => vi.advanceTimersByTime(60_000));
  expect(result.current).toBe(midnight);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
