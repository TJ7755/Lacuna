import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS } from '../../state/shortcutBindings';
import {
  useLearnKeyboardShortcuts,
  type UseLearnKeyboardShortcutsParams,
} from './useLearnKeyboardShortcuts';

function params(
  overrides: Partial<UseLearnKeyboardShortcutsParams> = {},
): UseLearnKeyboardShortcutsParams {
  return {
    phase: 'answer',
    reveal: vi.fn(),
    hide: vi.fn(),
    answer: vi.fn(),
    canUndo: true,
    isLinesModeCard: false,
    hintStep: 0,
    setHintStep: vi.fn(),
    undoLast: vi.fn(),
    navOpen: false,
    setNavOpen: vi.fn(),
    menuOpen: false,
    setMenuOpen: vi.fn(),
    editing: false,
    current: null,
    isTypingCard: false,
    suppressClassicGrading: false,
    openEdit: vi.fn(),
    hintsOpen: false,
    setHintsOpen: vi.fn(),
    gradingMode: 'silent',
    bindings: DEFAULT_BINDINGS,
    m: 1,
    focusMode: false,
    setFocusMode: vi.fn(),
    setFocusChromeVisible: vi.fn(),
    ...overrides,
  };
}

describe('study keyboard ownership', () => {
  it.each(['menuOpen', 'editing', 'navOpen', 'hintsOpen'] as const)(
    'does not grade through %s',
    (overlay) => {
      const callbacks = params({ [overlay]: true });
      renderHook(() => useLearnKeyboardShortcuts(callbacks));
      fireEvent.keyDown(window, { key: 'y' });
      expect(callbacks.answer).not.toHaveBeenCalled();
    },
  );

  it('does not reveal when Enter belongs to an editor field', () => {
    const callbacks = params({ phase: 'question', editing: true, isTypingCard: true });
    renderHook(() => useLearnKeyboardShortcuts(callbacks));
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(callbacks.reveal).not.toHaveBeenCalled();
    field.remove();
  });

  it('respects a consumed event and native button activation', () => {
    const callbacks = params({ phase: 'question' });
    renderHook(() => useLearnKeyboardShortcuts(callbacks));
    const button = document.createElement('button');
    document.body.append(button);
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });
    const consumed = new KeyboardEvent('keydown', { key: 'y', cancelable: true });
    consumed.preventDefault();
    window.dispatchEvent(consumed);
    expect(callbacks.reveal).not.toHaveBeenCalled();
    expect(callbacks.answer).not.toHaveBeenCalled();
    button.remove();
  });
});

it.each([
  { key: 'y', ctrlKey: true },
  { key: 'n', metaKey: true },
  { key: 'ArrowRight', code: 'ArrowRight', altKey: true },
  { key: 'u', ctrlKey: true },
  { key: 'f', metaKey: true },
  { key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true },
  { key: 'y', isComposing: true },
])('leaves modified and composing study keys to their owner: %j', (event) => {
  const callbacks = params();
  renderHook(() => useLearnKeyboardShortcuts(callbacks));
  fireEvent.keyDown(window, event);
  expect(callbacks.answer).not.toHaveBeenCalled();
  expect(callbacks.undoLast).not.toHaveBeenCalled();
  expect(callbacks.setFocusMode).not.toHaveBeenCalled();
  expect(callbacks.reveal).not.toHaveBeenCalled();
});

it.each(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'y', 'n'])(
  'leaves %s to a focused select',
  (key) => {
    const callbacks = params();
    renderHook(() => useLearnKeyboardShortcuts(callbacks));
    const select = document.createElement('select');
    document.body.append(select);
    try {
      fireEvent.keyDown(select, { key, code: key });
      expect(callbacks.answer).not.toHaveBeenCalled();
      expect(callbacks.hide).not.toHaveBeenCalled();
    } finally {
      select.remove();
    }
  },
);

it('retains unmodified grading and shifted letter bindings', () => {
  const callbacks = params();
  renderHook(() => useLearnKeyboardShortcuts(callbacks));
  fireEvent.keyDown(window, { key: 'Y', shiftKey: true });
  expect(callbacks.answer).toHaveBeenCalledWith(true);
});
