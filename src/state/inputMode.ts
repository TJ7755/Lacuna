import { useEffect, useState, useSyncExternalStore } from 'react';

export type InputMode = 'keyboard' | 'touch' | 'auto';

const KEY = 'lacuna.inputMode';
const FONT_SCALE_KEY = 'lacuna-font-scale';
const FONT_SCALE_USER_SET_KEY = 'lacuna-font-scale-user-set';

type ResolvedInput = 'keyboard' | 'touch';
let activeInput: ResolvedInput | undefined;
let pendingInputSwitch: number | undefined;
const inputListeners = new Set<() => void>();

function setActiveInput(next: ResolvedInput) {
  if (next === activeInput) return;
  activeInput = next;
  inputListeners.forEach((listener) => listener());
}

function onPointer(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    window.clearTimeout(pendingInputSwitch);
    if (event.type === 'pointermove') setActiveInput('keyboard');
    else if (event.type === 'pointerup') {
      pendingInputSwitch = window.setTimeout(() => setActiveInput('keyboard'), 0);
    }
  } else if (
    event.type === 'pointerup' &&
    (event.pointerType === 'touch' || event.pointerType === 'pen')
  ) {
    window.clearTimeout(pendingInputSwitch);
    // Keep the pressed control mounted until the browser dispatches its click.
    pendingInputSwitch = window.setTimeout(() => setActiveInput('touch'), 0);
  }
}

function onKeyboard(event: KeyboardEvent) {
  if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    window.clearTimeout(pendingInputSwitch);
    setActiveInput('keyboard');
  }
}

function subscribeToInput(listener: () => void) {
  inputListeners.add(listener);
  if (inputListeners.size === 1) {
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('pointermove', onPointer, true);
    window.addEventListener('pointerup', onPointer, true);
    window.addEventListener('keydown', onKeyboard, true);
  }
  return () => {
    inputListeners.delete(listener);
    if (inputListeners.size === 0) {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('pointermove', onPointer, true);
      window.removeEventListener('pointerup', onPointer, true);
      window.removeEventListener('keydown', onKeyboard, true);
      window.clearTimeout(pendingInputSwitch);
    }
  };
}

function automaticInput(): ResolvedInput {
  return (
    activeInput ??
    (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      ? 'touch'
      : 'keyboard')
  );
}

export function readInputMode(): InputMode {
  const raw = localStorage.getItem(KEY) as InputMode | null;
  if (raw === 'keyboard' || raw === 'touch') return raw;
  return 'auto';
}

export function resolveInputMode(mode: InputMode): 'keyboard' | 'touch' {
  if (mode === 'auto') return automaticInput();
  return mode;
}

export function writeInputMode(mode: InputMode): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent('lacuna:input-mode', { detail: mode }));
}

/**
 * Set the default font scale when the input mode changes, but only if the user
 * has never explicitly chosen a font scale themselves.
 */
function autoSetFontScaleForMode(mode: InputMode): void {
  const resolved = resolveInputMode(mode);
  const userHasSetScale = localStorage.getItem(FONT_SCALE_USER_SET_KEY) === '1';
  // Only auto-set to Large when switching to touch and the user has never manually
  // set a font scale. Never force-reset to Normal when switching to keyboard.
  if (resolved === 'touch' && !userHasSetScale) {
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
  const automatic = useSyncExternalStore(subscribeToInput, automaticInput, () => 'keyboard');
  return (mode === 'auto' ? automatic : mode) === 'touch';
}
