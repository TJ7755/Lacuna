import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedPending } from './useDelayedPending';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDelayedPending', () => {
  it('stays hidden for a load that resolves before the delay', async () => {
    const { result, rerender } = renderHook(({ pending }) => useDelayedPending(pending), {
      initialProps: { pending: true },
    });

    await act(() => vi.advanceTimersByTime(120));
    expect(result.current).toBe(false);

    rerender({ pending: false });
    await act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('shows the placeholder once loading passes the delay', async () => {
    const { result } = renderHook(() => useDelayedPending(true));

    await act(() => vi.advanceTimersByTime(249));
    expect(result.current).toBe(false);

    await act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('holds a shown placeholder for its minimum lifetime', async () => {
    const { result, rerender } = renderHook(({ pending }) => useDelayedPending(pending), {
      initialProps: { pending: true },
    });

    await act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);

    // Resolves 50ms after appearing; the placeholder must not blink straight out.
    await act(() => vi.advanceTimersByTime(50));
    rerender({ pending: false });
    expect(result.current).toBe(true);

    await act(() => vi.advanceTimersByTime(249));
    expect(result.current).toBe(true);

    await act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('hides immediately once the minimum lifetime has already elapsed', async () => {
    const { result, rerender } = renderHook(({ pending }) => useDelayedPending(pending), {
      initialProps: { pending: true },
    });

    // Advanced in two steps: the minimum-lifetime timer is only scheduled once
    // React has flushed the effect that made the placeholder visible.
    await act(() => vi.advanceTimersByTime(250));
    await act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(true);

    rerender({ pending: false });
    await act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });
});
