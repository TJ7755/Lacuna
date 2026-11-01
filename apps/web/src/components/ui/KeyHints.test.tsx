import { act, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyHints } from './KeyHints';
import { loadBindings, saveBindings, DEFAULT_BINDINGS } from '../../state/shortcutBindings';

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

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
  it('retires the closing overlay and revives its controls on rapid reopening', async () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <KeyHints open={open} onClose={vi.fn()} />
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const close = screen.getByRole('button', { name: 'Close' });
    rerender(view(false));
    expect(close).toBeInTheDocument();
    expect(close.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Close' })).toBe(close);
    expect(close.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(loadBindings()).toEqual(updated);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
