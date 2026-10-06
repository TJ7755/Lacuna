import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { useState } from 'react';
import { ConfirmInline, ConfirmInlineSwap, inlineConfirmTiming } from './ConfirmInline';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

describe('ConfirmInline', () => {
  it('renders the message and default labels', () => {
    render(<ConfirmInline message="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('gives both actions a 44px minimum target', () => {
    render(<ConfirmInline message="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('min-h-11');
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

  it('lets a long confirmation message wrap within a narrow row', () => {
    const message = `Delete ${'Immunity'.repeat(20)}?`;
    render(<ConfirmInline message={message} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(message)).toHaveStyle({ overflowWrap: 'anywhere' });
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

describe('ConfirmInlineSwap', () => {
  it('disables retained controls in both directions and refocuses a rapidly revived confirmation', async () => {
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <LazyMotion features={domAnimation}>
          <ConfirmInlineSwap
            active={active}
            message="Delete?"
            onConfirm={vi.fn()}
            onCancel={() => setActive(false)}
          >
            <button onClick={() => setActive(true)}>Delete note</button>
          </ConfirmInlineSwap>
        </LazyMotion>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Delete note' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toBeInTheDocument();
    expect(trigger.closest('[inert]')).not.toBeNull();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(cancel).toBeInTheDocument();
    expect(cancel.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(cancel);
    expect(cancel.closest('[inert]')).toBeNull();
    expect(cancel).toHaveFocus();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  });
  it('animates at the global multiplier', () => {
    expect(inlineConfirmTiming(1.4).duration).toBeCloseTo(0.224);
    expect(inlineConfirmTiming(0.6).duration).toBeCloseTo(0.096);
    expect(inlineConfirmTiming(0).duration).toBe(0);
  });

  it('moves focus into the replacement and restores it when cancelled', () => {
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <ConfirmInlineSwap
          active={active}
          message="Delete?"
          onConfirm={vi.fn()}
          onCancel={() => setActive(false)}
        >
          <button type="button">Edit note</button>
          <button type="button" onClick={() => setActive(true)}>
            Delete note
          </button>
        </ConfirmInlineSwap>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete note' })).toHaveFocus();
  });
});
