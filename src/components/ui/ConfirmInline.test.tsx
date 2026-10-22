import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { useState } from 'react';
import { ConfirmInline, ConfirmInlineSwap } from './ConfirmInline';

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
  it('blocks repeated confirmation and cancellation until the returned promise settles', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(<ConfirmInline message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />);
    const confirm = screen.getByRole('button', { name: 'Yes' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => finish());
    expect(confirm).toBeEnabled();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('honours caller-owned busy state without starting or cancelling work', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmInline disabled message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    const confirm = screen.getByRole('button', { name: 'Yes' });
    fireEvent.click(confirm);
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    rerender(<ConfirmInline message="Delete?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('retains caller error handling and allows retry afterwards', async () => {
    const report = vi.fn();
    const onConfirm = vi.fn(async () => {
      try {
        await Promise.reject(new Error('Deletion failed'));
      } catch (error) {
        report(error);
      }
    });
    render(<ConfirmInline message="Delete?" onConfirm={onConfirm} onCancel={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes' })));
    expect(report).toHaveBeenCalledWith(new Error('Deletion failed'));
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();
  });

  it('preserves focus deliberately restored by its cancellation callback', () => {
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <>
          <button onClick={() => setActive(true)}>Open confirmation</button>
          <button id="next-confirm-action">Next action</button>
          {active && (
            <ConfirmInline
              message="Delete?"
              onConfirm={vi.fn()}
              focusOnMount="cancel"
              onCancel={() => {
                setActive(false);
                document.getElementById('next-confirm-action')?.focus();
              }}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open confirmation' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Next action' })).toHaveFocus();
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
