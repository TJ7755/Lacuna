import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyHints } from './KeyHints';
import { loadBindings, saveBindings, DEFAULT_BINDINGS } from '../../state/shortcutBindings';

vi.mock('../../state/shortcuts', () => ({
  SHORTCUT_GROUPS: [
    {
      title: 'Study',
      shortcuts: [
        { description: 'Show the answer', keys: ['Space'] },
        { description: 'Mark correct', keys: ['Y'] },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        { description: 'Show this help', keys: ['?'] },
        { description: 'Open search', keys: ['/'] },
      ],
    },
  ],
}));

beforeEach(() => localStorage.clear());

describe('KeyHints', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyHints open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders as a dialog with correct aria attributes when open', async () => {
    render(<KeyHints open onClose={vi.fn()} />);
    const dialog = await screen.findByTestId('keyhints-dialog');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Keyboard shortcuts');
  });

  it('shows the title and group headings', () => {
    render(<KeyHints open onClose={vi.fn()} />);
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Study')).toBeInTheDocument();
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('lists shortcuts with descriptions and key labels', () => {
    render(<KeyHints open onClose={vi.fn()} />);
    expect(screen.getByText('Show the answer')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Mark correct')).toBeInTheDocument();
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByText('Open search')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('has a close button', () => {
    const onClose = vi.fn();
    render(<KeyHints open onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close');
    expect(closeBtn).toBeInTheDocument();
  });
});

it('refreshes displayed bindings when reopened and closes with the configured help key', () => {
  const onClose = vi.fn();
  const { rerender } = render(<KeyHints open={false} onClose={onClose} />);
  saveBindings({ ...DEFAULT_BINDINGS, help: 'b', yes: 'j' });
  rerender(<KeyHints open onClose={onClose} />);
  expect(screen.getByText('b')).toBeInTheDocument();
  expect(screen.getByText('j')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByTestId('keyhints-dialog'), { key: 'b' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('does not overwrite newer bindings from a closed help view', async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<KeyHints open={false} onClose={vi.fn()} />);
    const updated = { ...DEFAULT_BINDINGS, help: 'b', yes: 'j' };
    saveBindings(updated);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(loadBindings()).toEqual(updated);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
