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

  it('hides immediately when loading resolves after the delay', async () => {
    const { result, rerender } = renderHook(({ pending }) => useDelayedPending(pending), {
      initialProps: { pending: true },
    });

    await act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);

    rerender({ pending: false });
    expect(result.current).toBe(false);
  });

  it('restarts the delay when loading begins again', async () => {
    const { result, rerender } = renderHook(({ pending }) => useDelayedPending(pending), {
      initialProps: { pending: true },
    });

    await act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);

    rerender({ pending: false });
    rerender({ pending: true });
    expect(result.current).toBe(false);
    await act(() => vi.advanceTimersByTime(249));
    expect(result.current).toBe(false);
    await act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });
});
