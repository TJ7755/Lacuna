import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DialogHeader, DialogPanel } from './DialogPanel';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Happy DOM rejects cancelled native-animation promises; exercise Motion's real JS fallback.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

function renderDialog(onBackdropClick?: () => void) {
  const onClose = vi.fn();
  const onKeyDown = vi.fn();
  const trapRef = createRef<HTMLDivElement>();
  render(
    <DialogPanel
      label="Edit card"
      trapRef={trapRef}
      onKeyDown={onKeyDown}
      onBackdropClick={onBackdropClick}
      className="max-w-md"
    >
      <DialogHeader
        title="Edit card"
        description="Changes apply everywhere."
        onClose={onClose}
        closeLabel="Close editor"
      />
      <input aria-label="Front" />
    </DialogPanel>,
  );
  return { onClose, onKeyDown, trapRef };
}

describe('DialogPanel', () => {
  it('hides and disables the departing dialog without cancelling its visual exit', async () => {
    const trapRef = createRef<HTMLDivElement>();
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {open && (
            <DialogPanel label="Edit card" trapRef={trapRef} onKeyDown={vi.fn()}>
              <input aria-label="Front" />
            </DialogPanel>
          )}
        </AnimatePresence>
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const input = screen.getByRole('textbox', { name: 'Front' });
    rerender(view(false));
    expect(input).toBeInTheDocument();
    expect(input.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Edit card' })).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('textbox', { name: 'Front' })).toBe(input);
    expect(input.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  });
  it('renders a labelled modal panel inside the trapped overlay', () => {
    const { trapRef } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Edit card' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('rounded-3xl', 'bg-paper', 'max-w-md');
    expect(trapRef.current).toContainElement(dialog);
    expect(screen.getByRole('heading', { name: 'Edit card' })).toBeInTheDocument();
    expect(screen.getByText('Changes apply everywhere.')).toBeInTheDocument();
  });

  it('routes keys to the caller and closes from the header button', () => {
    const { onClose, onKeyDown } = renderDialog();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Front' }), { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledOnce();
    const close = screen.getByRole('button', { name: 'Close editor' });
    expect(close).toHaveClass('h-11', 'w-11');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('dismisses from the backdrop only when asked to', () => {
    const onBackdropClick = vi.fn();
    renderDialog(onBackdropClick);
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!);
    expect(onBackdropClick).toHaveBeenCalledOnce();
  });
});
