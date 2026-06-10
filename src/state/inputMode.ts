import { useEffect, useState } from 'react';

export type InputMode = 'keyboard' | 'touch' | 'auto';

const KEY = 'lacuna.inputMode';

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
      setMode(next);
    },
  ];
}

/** Whether the current resolved input mode is touch-first. */
export function useIsTouchMode(): boolean {
  const [mode] = useInputMode();
  return resolveInputMode(mode) === 'touch';
}
