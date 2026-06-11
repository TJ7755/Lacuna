import { useEffect, useState } from 'react';

export type InputMode = 'keyboard' | 'touch' | 'auto';

const KEY = 'lacuna.inputMode';
const FONT_SCALE_KEY = 'lacuna-font-scale';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function readInputMode(): InputMode {
  const raw = localStorage.getItem(KEY) as InputMode | null;
  if (raw === 'keyboard' || raw === 'touch') return raw;
  return 'auto';
}

export function resolveInputMode(mode: InputMode): 'keyboard' | 'touch' {
  if (mode === 'auto') return isTouchDevice() ? 'touch' : 'keyboard';
  return mode;
}

export function writeInputMode(mode: InputMode): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent('lacuna:input-mode', { detail: mode }));
}

/**
 * Set the default font scale when the input mode changes, but only if the user
 * has not explicitly chosen a font scale. We detect this by checking whether
 * the current font scale matches one of the named steps.
 */
function autoSetFontScaleForMode(mode: InputMode): void {
  const resolved = resolveInputMode(mode);
  const current = Number(localStorage.getItem(FONT_SCALE_KEY) ?? '1');
  // Only auto-set to Large when switching to touch if the current scale is the default
  // (1.0). Never force-reset to Normal when switching to keyboard, to avoid clobbering
  // an explicit user choice.
  if (resolved === 'touch' && current === 1) {
    localStorage.setItem(FONT_SCALE_KEY, '1.15');
    document.documentElement.style.fontSize = '115%';
    window.dispatchEvent(new CustomEvent('lacuna:font-scale', { detail: 1.15 }));
  }
}

export function useInputMode(): [InputMode, (mode: InputMode) => void] {
  const [mode, setMode] = useState<InputMode>(() => readInputMode());

  useEffect(() => {
    const onChange = () => setMode(readInputMode());
    window.addEventListener('storage', onChange);
    window.addEventListener('lacuna:input-mode', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('lacuna:input-mode', onChange);
    };
  }, []);

  return [
    mode,
    (next) => {
      writeInputMode(next);
      autoSetFontScaleForMode(next);
      setMode(next);
    },
  ];
}

/** Whether the current resolved input mode is touch-first. */
export function useIsTouchMode(): boolean {
  const [mode] = useInputMode();
  return resolveInputMode(mode) === 'touch';
}
