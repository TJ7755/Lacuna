import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { readInputMode, resolveInputMode, useIsTouchMode } from './inputMode';

beforeEach(() => localStorage.clear());

it.each(['keyboard', 'touch'] as const)('honours an explicit %s override', (mode) => {
  expect(resolveInputMode(mode)).toBe(mode);
});

describe('automatic input on hybrid devices', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('prefers a fine primary pointer despite touch capability', () => {
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(10);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    expect(resolveInputMode('auto')).toBe('keyboard');
  });

  it('responds to touch, mouse, pen and keyboard without overwriting the preference', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useIsTouchMode());
    fireEvent.pointerMove(window, { pointerType: 'mouse' });
    fireEvent.pointerDown(window, { pointerType: 'touch' });
    expect(result.current).toBe(false);
    fireEvent.pointerUp(window, { pointerType: 'touch' });
    expect(result.current).toBe(false);
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current).toBe(true);
    fireEvent.pointerMove(window, { pointerType: 'mouse' });
    expect(result.current).toBe(false);
    fireEvent.pointerDown(window, { pointerType: 'pen' });
    fireEvent.pointerUp(window, { pointerType: 'pen' });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current).toBe(true);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(result.current).toBe(false);
    expect(readInputMode()).toBe('auto');
    unmount();
  });
});
