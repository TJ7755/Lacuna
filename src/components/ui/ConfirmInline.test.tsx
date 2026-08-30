import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmInline } from './ConfirmInline';

describe('ConfirmInline', () => {
  it('renders the message and default labels', () => {
    render(<ConfirmInline message="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmInline message="Delete?" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmInline message="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('supports custom labels', () => {
    render(
      <ConfirmInline
        message="Replace all data?"
        confirmLabel="Restore"
        cancelLabel="Not now"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Restore')).toBeInTheDocument();
    expect(screen.getByText('Not now')).toBeInTheDocument();
  });

  it('can announce a replacement prompt and move focus into it', () => {
    render(
      <ConfirmInline
        message="Delete this restore point?"
        confirmLabel="Delete restore point"
        announce
        focusOnMount="confirm"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Delete this restore point?');
    expect(screen.getByRole('button', { name: 'Delete restore point' })).toHaveFocus();
  });
});
