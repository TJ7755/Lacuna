import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsSection } from './ShortcutsSection';
import { loadBindings } from '../../state/shortcutBindings';
import { useLearnKeyboardShortcuts } from '../learn/useLearnKeyboardShortcuts';

const notify = vi.fn();

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

describe('ShortcutsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    notify.mockReset();
  });

  it('rejects a key already assigned to another study action', () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
    fireEvent.keyDown(window, { key: 'n' });

    expect(notify).toHaveBeenCalledWith(
      'That key is already assigned to Mark incorrect (silent mode).',
      'negative',
    );
    expect(screen.getByText('Press a key…')).toBeInTheDocument();
  });

  it.each(['ArrowDown', 'ArrowUp', 'ArrowLeft', '/', 'h', 'r', 'F1'])(
    'rejects the reserved alias %s and keeps capture open',
    (key) => {
      render(<ShortcutsSection />);
      const trigger = screen.getByRole('button', { name: /Mark correct/ });
      fireEvent.click(trigger);
      fireEvent.keyDown(window, { key });
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('reserved'), 'negative');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(trigger).toHaveTextContent('y');
    },
  );

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
    'rejects a modified key instead of saving its plain character: %j',
    (modifiers) => {
      render(<ShortcutsSection />);
      fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
      fireEvent.keyDown(window, { key: 'q', ...modifiers });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(notify).toHaveBeenCalledWith('Use a single key without Ctrl, Cmd or Alt.', 'negative');
      expect(loadBindings().yes).toBe('y');
    },
  );

  it.each([
    { key: 'q', isComposing: true },
    { key: 'q', keyCode: 229 },
    { key: 'Escape', isComposing: true },
    { key: 'Process' },
  ])('leaves input-method composition to its owner: %j', (event) => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
    expect(fireEvent.keyDown(window, { ...event, cancelable: true })).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects case-insensitive collisions with another study action', () => {
    localStorage.setItem('lacuna-shortcut-bindings', JSON.stringify({ no: 'Q' }));
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
    fireEvent.keyDown(window, { key: 'q' });
    expect(notify).toHaveBeenCalledWith(
      'That key is already assigned to Mark incorrect (silent mode).',
      'negative',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('persists a shifted letter assignment that performs the advertised study action', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<ShortcutsSection />);
      fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
      fireEvent.keyDown(window, { key: 'Q', shiftKey: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      unmount();
      expect(loadBindings().yes).toBe('q');
      const answer = vi.fn();
      renderHook(() =>
        useLearnKeyboardShortcuts({
          phase: 'answer',
          reveal: vi.fn(),
          hide: vi.fn(),
          answer,
          canUndo: false,
          isLinesModeCard: false,
          hintStep: 0,
          setHintStep: vi.fn(),
          undoLast: vi.fn(),
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
          bindings: loadBindings(),
          m: 0,
          focusMode: false,
          setFocusMode: vi.fn(),
          setFocusChromeVisible: vi.fn(),
        }),
      );
      fireEvent.keyDown(window, { key: 'Q', shiftKey: true });
      expect(answer).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels the modal, traps Tab and restores focus after Escape', () => {
    render(<ShortcutsSection />);
    const trigger = screen.getByRole('button', { name: /Mark correct/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /Set shortcut for Mark correct/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: 'Cancel shortcut capture' });
    expect(dialog).toHaveFocus();

    expect(fireEvent.keyDown(window, { key: 'Tab', cancelable: true })).toBe(true);
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('captures a key and returns focus to the shortcut button', () => {
    render(<ShortcutsSection />);
    const trigger = screen.getByRole('button', { name: /Mark correct/ });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(window, { key: 'q' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('q');
    expect(notify).toHaveBeenCalledWith('Shortcut updated.', 'positive');
  });

  it('closes from the cancel button and restores focus', () => {
    render(<ShortcutsSection />);
    const trigger = screen.getByRole('button', { name: /Mark correct/ });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole('button', { name: 'Cancel shortcut capture' });
    close.focus();
    expect(fireEvent.keyDown(close, { key: 'Enter', cancelable: true })).toBe(true);
    fireEvent.click(close);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
