import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLoadingVisibility } from './useLoadingVisibility';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('never shows a loader for a fast read', async () => {
  const { result, rerender } = renderHook(({ pending }) => useLoadingVisibility(pending), {
    initialProps: { pending: true },
  });
  await act(() => vi.advanceTimersByTime(199));
  expect(result.current).toBe(false);
  rerender({ pending: false });
  await act(() => vi.advanceTimersByTime(1000));
  expect(result.current).toBe(false);
});

it('holds a shown loader for 200 ms across the arrival of content', async () => {
  const { result, rerender } = renderHook(({ pending }) => useLoadingVisibility(pending), {
    initialProps: { pending: true },
  });
  await act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(true);
  await act(() => vi.advanceTimersByTime(10));
  rerender({ pending: false });
  await act(() => vi.advanceTimersByTime(189));
  expect(result.current).toBe(true);
  await act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(false);
});

it('cancels a pending hide when the next loading stage starts', async () => {
  const { result, rerender } = renderHook(({ pending }) => useLoadingVisibility(pending), {
    initialProps: { pending: true },
  });
  await act(() => vi.advanceTimersByTime(200));
  rerender({ pending: false });
  rerender({ pending: true });
  await act(() => vi.advanceTimersByTime(300));
  expect(result.current).toBe(true);
  rerender({ pending: false });
  expect(result.current).toBe(false);
});

it('starts the minimum lifetime when React commits, even if a render was delayed', async () => {
  const { result, rerender } = renderHook(({ pending }) => useLoadingVisibility(pending), {
    initialProps: { pending: true },
  });
  // The timer fires at 200 ms, but React cannot commit until this turn ends at 500 ms.
  await act(() => vi.advanceTimersByTime(500));
  rerender({ pending: false });
  expect(result.current).toBe(true);
  await act(() => vi.advanceTimersByTime(199));
  expect(result.current).toBe(true);
  await act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(false);
});
