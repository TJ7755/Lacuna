import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { readInputMode, resolveInputMode, writeInputMode, useIsTouchMode } from './inputMode';

const KEY = 'lacuna.inputMode';

beforeEach(() => {
  localStorage.clear();
  // Reset window event listeners if needed
});

describe('readInputMode', () => {
  it('returns auto when nothing is stored', () => {
    expect(readInputMode()).toBe('auto');
  });

  it('returns keyboard when stored', () => {
    localStorage.setItem(KEY, 'keyboard');
    expect(readInputMode()).toBe('keyboard');
  });

  it('returns touch when stored', () => {
    localStorage.setItem(KEY, 'touch');
    expect(readInputMode()).toBe('touch');
  });

  it('returns auto for invalid stored values', () => {
    localStorage.setItem(KEY, 'mouse');
    expect(readInputMode()).toBe('auto');
  });
});

describe('resolveInputMode', () => {
  it('returns keyboard when mode is keyboard', () => {
    expect(resolveInputMode('keyboard')).toBe('keyboard');
  });

  it('returns touch when mode is touch', () => {
    expect(resolveInputMode('touch')).toBe('touch');
  });

  it('auto resolves based on device capabilities', () => {
    const result = resolveInputMode('auto');
    expect(result === 'keyboard' || result === 'touch').toBe(true);
  });
});

describe('writeInputMode', () => {
  it('persists the mode to localStorage', () => {
    writeInputMode('touch');
    expect(localStorage.getItem(KEY)).toBe('touch');
  });

  it('dispatches a custom event', () => {
    let eventFired = false;
    const handler = () => {
      eventFired = true;
    };
    window.addEventListener('lacuna:input-mode', handler);
    writeInputMode('keyboard');
    window.removeEventListener('lacuna:input-mode', handler);
    expect(eventFired).toBe(true);
  });
});

describe('resolveInputMode auto', () => {
  it('returns a valid device type for auto mode', () => {
    const result = resolveInputMode('auto');
    expect(result === 'keyboard' || result === 'touch').toBe(true);
  });
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
    act(() => { vi.runAllTimers(); });
    expect(result.current).toBe(true);
    fireEvent.pointerMove(window, { pointerType: 'mouse' });
    expect(result.current).toBe(false);
    fireEvent.pointerDown(window, { pointerType: 'pen' });
    fireEvent.pointerUp(window, { pointerType: 'pen' });
    act(() => { vi.runAllTimers(); });
    expect(result.current).toBe(true);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(result.current).toBe(false);
    expect(readInputMode()).toBe('auto');
    act(() => writeInputMode('touch'));
    fireEvent.pointerDown(window, { pointerType: 'mouse' });
    expect(result.current).toBe(true);
    unmount();
  });
});
