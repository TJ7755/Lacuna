import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AnimatedDisclosure, animatedDisclosureTiming } from './AnimatedDisclosure';
import { expandingActionSpring } from './motion';
import { domAnimation, LazyMotion } from 'motion/react';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

describe('animatedDisclosureTiming', () => {
  it('follows the global speed and reduced-motion multipliers', () => {
    expect(animatedDisclosureTiming(1.4).height).toEqual(expandingActionSpring(1.4));
    expect(animatedDisclosureTiming(1.4).opacity.duration).toBeCloseTo(0.168);
    expect(animatedDisclosureTiming(0.6).height).toEqual(expandingActionSpring(0.6));
    expect(animatedDisclosureTiming(0.6).opacity.duration).toBeCloseTo(0.072);
    expect(animatedDisclosureTiming(0)).toEqual({
      height: { duration: 0 },
      opacity: { duration: 0 },
    });
  });
});

describe('AnimatedDisclosure', () => {
  it('makes departing controls inert immediately and revives them when reopened during exit', async () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatedDisclosure open={open}>
          <button type="button">Optional action</button>
        </AnimatedDisclosure>
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const control = screen.getByRole('button', { name: 'Optional action' });
    rerender(view(false));
    expect(control).toBeInTheDocument();
    expect(control.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Optional action' })).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Optional action' })).toBe(control);
    expect(control.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
  });
  it('retains a closed form draft while making its controls inert', () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatedDisclosure open={open} retainContent>
          <input aria-label="Draft" defaultValue="Original" />
        </AnimatedDisclosure>
      </LazyMotion>
    );
    const { rerender } = render(view(false));
    expect(screen.getByLabelText('Draft')).toBeInTheDocument();
    rerender(view(true));
    const input = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.input(input, { target: { value: 'Uncommitted' } });
    rerender(view(false));
    expect(input.closest('[inert]')).not.toBeNull();
    rerender(view(true));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('Uncommitted');
  });
  it('renders content only while it is open', () => {
    const { rerender } = render(
      <AnimatedDisclosure open={false}>
        <p>Optional controls</p>
      </AnimatedDisclosure>,
    );
    expect(screen.queryByText('Optional controls')).not.toBeInTheDocument();

    rerender(
      <AnimatedDisclosure open>
        <p>Optional controls</p>
      </AnimatedDisclosure>,
    );
    expect(screen.getByText('Optional controls')).toBeInTheDocument();
  });
});
