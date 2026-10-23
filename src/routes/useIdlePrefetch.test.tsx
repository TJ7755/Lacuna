import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdlePrefetch } from './useIdlePrefetch';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestIdleCallback', undefined);
  vi.stubGlobal('cancelIdleCallback', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useIdlePrefetch', () => {
  it('prefetches one path per fallback timer and cancels stale paths', () => {
    const prefetch = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ paths }) => useIdlePrefetch(paths, prefetch),
      { initialProps: { paths: ['/first', '/stale'] } },
    );
    act(() => vi.advanceTimersByTime(199));
    expect(prefetch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(prefetch.mock.calls).toEqual([['/first']]);
    rerender({ paths: ['/replacement', '/cancelled'] });
    act(() => vi.advanceTimersByTime(200));
    expect(prefetch.mock.calls).toEqual([['/first'], ['/replacement']]);
    unmount();
    act(() => vi.runAllTimers());
    expect(prefetch).toHaveBeenCalledTimes(2);
  });

  it('uses the idle timeout and cancels the outstanding callback', () => {
    const request = vi.fn(() => 42);
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const prefetch = vi.fn();
    const { unmount } = renderHook(() => useIdlePrefetch(['/lesson'], prefetch));
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(prefetch).not.toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('does not prefetch while the document is hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const prefetch = vi.fn();
    renderHook(() => useIdlePrefetch(['/lesson'], prefetch));
    act(() => vi.runAllTimers());
    expect(prefetch).not.toHaveBeenCalled();
  });
});
