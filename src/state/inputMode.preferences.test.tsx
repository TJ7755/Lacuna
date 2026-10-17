import { act, fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FontScaleProvider, useFontScale } from './FontScaleContext';
import { readInputMode, useInputMode, useIsTouchMode } from './inputMode';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.fontSize = '';
});

function usePreferences() {
  const [mode, setMode] = useInputMode();
  return { mode, setMode, touch: useIsTouchMode(), ...useFontScale() };
}

describe('input preference independence', () => {
  it.each(['keyboard', 'touch'] as const)(
    'restores %s after a round trip without changing text size',
    (mode) => {
      const { result, unmount } = renderHook(usePreferences, { wrapper: FontScaleProvider });
      const choose = (next: typeof mode | 'auto') => act(() => result.current.setMode(next));
      choose(mode);
      const initial = {
        touch: result.current.touch,
        scale: result.current.scale,
        font: document.documentElement.style.fontSize,
      };
      choose(mode === 'keyboard' ? 'touch' : 'keyboard');
      expect(result.current.scale).toBe(1);
      choose(mode);
      expect({
        touch: result.current.touch,
        scale: result.current.scale,
        font: document.documentElement.style.fontSize,
      }).toEqual(initial);
      expect(readInputMode()).toBe(mode);
      unmount();
      const restored = renderHook(usePreferences, { wrapper: FontScaleProvider });
      expect(restored.result.current.mode).toBe(mode);
      expect(restored.result.current.touch).toBe(mode === 'touch');
      expect(restored.result.current.scale).toBe(1);
    },
  );

  it('preserves explicit text size and unrelated preferences', () => {
    const { result } = renderHook(usePreferences, { wrapper: FontScaleProvider });
    act(() => result.current.setScale(1.3));
    localStorage.setItem('lacuna.motionSpeed', 'slow');
    const before = { ...localStorage };
    for (const mode of ['touch', 'keyboard', 'auto'] as const) {
      act(() => result.current.setMode(mode));
      expect(result.current.scale).toBe(1.3);
    }
    const after = { ...localStorage };
    delete before['lacuna.inputMode'];
    delete after['lacuna.inputMode'];
    expect(after).toEqual(before);
  });

  it('keeps detecting real activity under explicit modes and returns Auto to that activity', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(usePreferences, { wrapper: FontScaleProvider });
      act(() => result.current.setMode('keyboard'));
      fireEvent.pointerUp(window, { pointerType: 'touch' });
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.touch).toBe(false);
      act(() => result.current.setMode('auto'));
      expect(result.current.touch).toBe(true);
      act(() => result.current.setMode('touch'));
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(result.current.touch).toBe(true);
      act(() => result.current.setMode('auto'));
      expect(result.current.touch).toBe(false);
      fireEvent.pointerUp(window, { pointerType: 'pen' });
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.touch).toBe(true);
      fireEvent.pointerMove(window, { pointerType: 'mouse' });
      expect(result.current.touch).toBe(false);
      expect(readInputMode()).toBe('auto');
    } finally {
      vi.useRealTimers();
    }
  });
});
