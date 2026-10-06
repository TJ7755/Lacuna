import { act, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyHints } from './KeyHints';

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
      shortcuts: [{ description: 'Open search', keys: ['/'] }],
    },
  ],
}));

vi.mock('../../state/shortcutBindings', () => ({
  useShortcutBindings: () => ({
    bindings: {
      reveal: { key: 'Space', ctrl: false, meta: false, alt: false, shift: false },
      yes: { key: 'y', ctrl: false, meta: false, alt: false, shift: false },
      no: { key: 'n', ctrl: false, meta: false, alt: false, shift: false },
      again: { key: '1', ctrl: false, meta: false, alt: false, shift: false },
      hard: { key: '2', ctrl: false, meta: false, alt: false, shift: false },
      good: { key: '3', ctrl: false, meta: false, alt: false, shift: false },
      easy: { key: '4', ctrl: false, meta: false, alt: false, shift: false },
      edit: { key: 'e', ctrl: false, meta: false, alt: false, shift: false },
      focus: { key: 'f', ctrl: false, meta: false, alt: false, shift: false },
      undo: { key: 'u', ctrl: false, meta: false, alt: false, shift: false },
    },
  }),
  formatBinding: (b: { key: string }) => b.key,
}));

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
