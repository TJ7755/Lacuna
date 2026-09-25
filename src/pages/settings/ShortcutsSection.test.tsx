import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsSection } from './ShortcutsSection';

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
