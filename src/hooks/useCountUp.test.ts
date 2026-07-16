import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from './useCountUp';

let frames: FrameRequestCallback[];

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCountUp', () => {
  it('uses the dashboard count-up timing and reaches its target', async () => {
    const { result } = renderHook(() => useCountUp(12, 1000, 300, 1));
    expect(result.current).toBe(0);

    await act(() => vi.advanceTimersByTime(300));
    await act(() => frames.shift()?.(0));
    await act(() => frames.shift()?.(1000));

    expect(result.current).toBe(12);
  });

  it('scales the delay and duration with the motion multiplier', async () => {
    renderHook(() => useCountUp(12, 1000, 300, 2));

    await act(() => vi.advanceTimersByTime(599));
    expect(frames).toHaveLength(0);
    await act(() => vi.advanceTimersByTime(1));
    expect(frames).toHaveLength(1);
  });

  it('shows the target immediately when reduced motion disables animation', () => {
    const { result } = renderHook(() => useCountUp(12, 1000, 300, 0));
    expect(result.current).toBe(12);
    expect(frames).toHaveLength(0);
  });
});
