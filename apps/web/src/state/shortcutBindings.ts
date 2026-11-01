import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'lacuna-shortcut-bindings';

export type LearnAction =
  'reveal' | 'yes' | 'no' | 'again' | 'hard' | 'good' | 'easy' | 'edit' | 'undo' | 'focus' | 'help';

export interface ShortcutBindings {
  reveal: string;
  yes: string;
  no: string;
  again: string;
  hard: string;
  good: string;
  easy: string;
  edit: string;
  undo: string;
  focus: string;
  help: string;
}

export const DEFAULT_BINDINGS: ShortcutBindings = {
  reveal: 'Space',
  yes: 'y',
  no: 'n',
  again: '1',
  hard: '2',
  good: '3',
  easy: '4',
  edit: 'e',
  undo: 'u',
  focus: 'f',
  help: '?',
};

export const ACTION_LABELS: Record<LearnAction, string> = {
  reveal: 'Show answer',
  yes: 'Mark correct (silent mode)',
  no: 'Mark incorrect (silent mode)',
  again: 'Again (manual mode)',
  hard: 'Hard (manual mode)',
  good: 'Good (manual mode)',
  easy: 'Easy (manual mode)',
  edit: 'Edit the current card',
  undo: 'Undo the last answer',
  focus: 'Toggle focus mode',
  help: 'Show keyboard shortcuts',
};

// Fixed aliases are handled separately from configurable study actions.
const RESERVED_BINDINGS: Record<string, { action?: LearnAction; label: string }> = {
  ArrowUp: { action: 'reveal', label: 'showing the answer' },
  ArrowDown: { label: 'hiding the answer' },
  ArrowRight: { action: 'yes', label: 'marking correct' },
  ArrowLeft: { action: 'no', label: 'marking incorrect' },
  '/': { label: 'search' },
  h: { label: 'line hints' },
  r: { label: 'audio replay' },
  Escape: { label: 'cancelling and closing' },
  Tab: { label: 'moving keyboard focus' },
  F1: { label: 'Lacuna Help' },
};

const UNASSIGNABLE_BINDINGS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'Dead',
  'Process',
  'Unidentified',
]);

function normaliseBinding(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Validate a single-key assignment against fixed aliases and the other study bindings. */
export function bindingError(
  action: LearnAction,
  key: string,
  bindings?: ShortcutBindings,
): string | null {
  const normalised = normaliseBinding(key);
  const reserved = RESERVED_BINDINGS[normalised];
  if (reserved && reserved.action !== action) return `That key is reserved for ${reserved.label}.`;
  if (
    !normalised ||
    UNASSIGNABLE_BINDINGS.has(normalised) ||
    (normalised.length > 1 && /[+\s]/.test(normalised))
  )
    return 'Choose a single character or a named key such as Space or Enter.';
  const conflict =
    bindings &&
    (Object.keys(bindings) as LearnAction[]).find(
      (candidate) => candidate !== action && normaliseBinding(bindings[candidate]) === normalised,
    );
  return conflict ? `That key is already assigned to ${ACTION_LABELS[conflict]}.` : null;
}

function readStoredBindings(): Partial<ShortcutBindings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const stored = parsed as Record<string, unknown>;
      const bindings: Partial<ShortcutBindings> = {};
      for (const action of Object.keys(DEFAULT_BINDINGS) as LearnAction[]) {
        const value = stored[action];
        if (typeof value === 'string' && !bindingError(action, value)) bindings[action] = value;
      }
      return bindings;
    }
  } catch {
    // Invalid stored JSON; fall back to defaults.
  }
  return {};
}

function saveStoredBindings(bindings: ShortcutBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Persistence is best-effort.
  }
}

export function loadBindings(): ShortcutBindings {
  const stored = readStoredBindings();
  return { ...DEFAULT_BINDINGS, ...stored };
}

export function saveBindings(bindings: ShortcutBindings) {
  saveStoredBindings(bindings);
}

export function resetBindings() {
  saveStoredBindings(DEFAULT_BINDINGS);
  return { ...DEFAULT_BINDINGS };
}

/**
 * Check whether a keyboard event matches a stored binding.
 * Letter bindings are case-insensitive. Named keys (Space, ArrowUp, etc.)
 * match on `e.code` for Space and `e.key` for everything else.
 */
export function keyMatches(e: KeyboardEvent, binding: string): boolean {
  if (binding === 'Space') return e.code === 'Space';
  if (binding.startsWith('Arrow')) return e.key === binding;
  if (binding.length === 1 && /[a-z]/i.test(binding)) {
    return e.key.toLowerCase() === binding.toLowerCase();
  }
  return e.key === binding;
}

/** A human-readable label for a binding string. */
export function formatBinding(binding: string): string {
  if (binding === ' ') return 'Space';
  if (binding === 'ArrowUp') return 'Up';
  if (binding === 'ArrowDown') return 'Arrow down';
  if (binding === 'ArrowLeft') return 'Left';
  if (binding === 'ArrowRight') return 'Right';
  return binding;
}

/** React hook that keeps bindings in state and persists changes to localStorage. */
export function useShortcutBindings() {
  const [bindings, setBindingsState] = useState<ShortcutBindings>(loadBindings);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveBindings(bindings);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [bindings]);

  const setBinding = useCallback((action: LearnAction, key: string) => {
    setBindingsState((prev) =>
      bindingError(action, key, prev) ? prev : { ...prev, [action]: key },
    );
  }, []);

  const reset = useCallback(() => {
    setBindingsState({ ...DEFAULT_BINDINGS });
  }, []);

  return { bindings, setBinding, reset };
}
