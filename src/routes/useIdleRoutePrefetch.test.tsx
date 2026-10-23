import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleRoutePrefetch } from './useIdleRoutePrefetch';
import { prefetchRoute } from './prefetch';

vi.mock('./prefetch', () => ({ prefetchRoute: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(prefetchRoute).mockClear();
  vi.stubGlobal('requestIdleCallback', undefined);
  vi.stubGlobal('cancelIdleCallback', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useIdleRoutePrefetch', () => {
  it('prefetches one path per fallback timer and cancels stale paths', async () => {
    const prefetch = vi.mocked(prefetchRoute);
    const { rerender, unmount } = renderHook(
      ({ paths }) => useIdleRoutePrefetch(paths),
      { initialProps: { paths: ['/first', '/stale'] } },
    );
    await act(() => vi.advanceTimersByTime(199));
    expect(prefetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTime(1));
    expect(prefetch.mock.calls).toEqual([['/first']]);
    rerender({ paths: ['/replacement', '/cancelled'] });
    await act(() => vi.advanceTimersByTime(200));
    expect(prefetch.mock.calls).toEqual([['/first'], ['/replacement']]);
    unmount();
    await act(() => vi.runAllTimers());
    expect(prefetch).toHaveBeenCalledTimes(2);
  });

  it('uses the idle timeout and cancels the outstanding callback', () => {
    let next: (() => void) | undefined;
    const request = vi.fn((callback: () => void) => {
      next = callback;
      return 42;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const prefetch = vi.mocked(prefetchRoute);
    const { unmount } = renderHook(() => useIdleRoutePrefetch(['/lesson']));
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(prefetch).not.toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
    next?.();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('does not prefetch while the document is hidden', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const prefetch = vi.mocked(prefetchRoute);
    renderHook(() => useIdleRoutePrefetch(['/lesson']));
    await act(() => vi.runAllTimers());
    expect(prefetch).not.toHaveBeenCalled();
  });
});
