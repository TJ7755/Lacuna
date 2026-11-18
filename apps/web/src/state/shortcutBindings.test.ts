import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { loadBindings, keyMatches, formatBinding, useShortcutBindings } from './shortcutBindings';

const STORAGE_KEY = 'lacuna-shortcut-bindings';
const expectedDefaults = {
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

beforeEach(() => {
  localStorage.clear();
});

describe('useShortcutBindings', () => {
  it.each(['change', 'reset'] as const)('persists a %s before immediate unmount', (operation) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reveal: 'Enter' }));
    const { result, unmount } = renderHook(() => useShortcutBindings());

    act(() => {
      if (operation === 'change') result.current.setBinding('reveal', 'q');
      else result.current.reset();
      unmount();
    });

    const reopened = renderHook(() => useShortcutBindings());
    expect(reopened.result.current.bindings).toEqual({
      ...expectedDefaults,
      reveal: operation === 'change' ? 'q' : expectedDefaults.reveal,
    });
    reopened.unmount();
  });
});

describe('loadBindings', () => {
  it('returns defaults when nothing is stored', () => {
    const bindings = loadBindings();
    expect(bindings).toEqual(expectedDefaults);
  });

  it('merges stored overrides with defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reveal: 'Enter' }));
    const bindings = loadBindings();
    expect(bindings.reveal).toBe('Enter');
    expect(bindings.yes).toBe(expectedDefaults.yes);
  });

  it('ignores invalid stored JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const bindings = loadBindings();
    expect(bindings).toEqual(expectedDefaults);
  });
});

describe('keyMatches', () => {
  it('matches Space binding', () => {
    const e = new KeyboardEvent('keydown', { code: 'Space' });
    expect(keyMatches(e, 'Space')).toBe(true);
    expect(keyMatches(e, 'Enter')).toBe(false);
  });

  it('matches letter bindings case-insensitively', () => {
    const e = new KeyboardEvent('keydown', { key: 'Y' });
    expect(keyMatches(e, 'y')).toBe(true);
    expect(keyMatches(e, 'n')).toBe(false);
  });

  it('matches arrow keys', () => {
    const e = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    expect(keyMatches(e, 'ArrowUp')).toBe(true);
    expect(keyMatches(e, 'ArrowDown')).toBe(false);
  });
});

describe('formatBinding', () => {
  it('formats special keys', () => {
    expect(formatBinding(' ')).toBe('Space');
    expect(formatBinding('ArrowUp')).toBe('Up');
    expect(formatBinding('ArrowDown')).toBe('Arrow down');
    expect(formatBinding('ArrowLeft')).toBe('Left');
    expect(formatBinding('ArrowRight')).toBe('Right');
  });

  it('returns the binding as-is for normal keys', () => {
    expect(formatBinding('y')).toBe('y');
    expect(formatBinding('1')).toBe('1');
  });
});

it.each([null, false, 42, [], {}, ''])(
  'ignores malformed saved binding %j while retaining valid overrides',
  (reveal) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reveal, yes: 'j', unknown: 'x' }));
    expect(loadBindings()).toEqual({ ...expectedDefaults, yes: 'j' });
  },
);

it.each([null, ['Enter'], 'Enter', 42])('ignores a non-object bindings record %j', (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  expect(loadBindings()).toEqual(expectedDefaults);
});

it.each([
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  '/',
  'h',
  'r',
  'Tab',
  'Escape',
  'F1',
  'Control',
  'Ctrl+q',
  'Dead',
  'Process',
  'Unidentified',
])('ignores reserved or unsupported saved keys without discarding valid overrides: %s', (key) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ yes: key, again: 'a' }));
  expect(loadBindings()).toEqual({ ...expectedDefaults, again: 'a' });
});

it('retains fixed aliases assigned to their own actions', () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ reveal: 'ArrowUp', yes: 'ArrowRight', no: 'ArrowLeft' }),
  );
  expect(loadBindings()).toEqual({
    ...expectedDefaults,
    reveal: 'ArrowUp',
    yes: 'ArrowRight',
    no: 'ArrowLeft',
  });
});

it.each(['Enter', 'Home', 'Pause', 'Clear', 'F25', '+'])(
  'retains valid character and named-key overrides: %s',
  (key) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ yes: key }));
    expect(loadBindings().yes).toBe(key);
  },
);
