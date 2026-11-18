import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { StepSwap } from './StepSwap';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

// Exercise Motion's JS fallback: Happy DOM rejects cancelled native animations.
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

describe('StepSwap', () => {
  it('focuses an incoming heading when step focus is requested', () => {
    const { rerender } = render(
      <StepSwap stepKey="first" moveFocus>
        <h2>Choose a course</h2>
      </StepSwap>,
    );
    expect(screen.getByRole('heading', { name: 'Choose a course' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Choose a course' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    rerender(
      <StepSwap stepKey="second" moveFocus>
        <h2>Choose a lesson</h2>
      </StepSwap>,
    );
    expect(screen.getByRole('heading', { name: 'Choose a lesson' })).toHaveFocus();
  });

  it('retires the outgoing controls during a real step change and revives them on return', async () => {
    const view = (step: string) => (
      <LazyMotion features={domAnimation}>
        <StepSwap stepKey={step}>
          <button>{step === 'first' ? 'Old choice' : 'New choice'}</button>
        </StepSwap>
      </LazyMotion>
    );
    const { rerender } = render(view('first'));
    const old = screen.getByRole('button', { name: 'Old choice' });
    rerender(view('second'));
    expect(old).toBeInTheDocument();
    expect(old.closest('[inert]')).not.toBeNull();
    expect(old.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Old choice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New choice' }).closest('[inert]')).toBeNull();
    rerender(view('first'));
    expect(screen.getByRole('button', { name: 'Old choice' })).toBe(old);
    expect(old.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  });
});
