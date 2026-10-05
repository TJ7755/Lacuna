import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DialogHeader, DialogPanel } from './DialogPanel';

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
