import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepSwap, stepSwapTiming } from './StepSwap';

const presence = vi.hoisted(() => ({ current: true }));
vi.mock('motion/react', async () => ({
  ...(await vi.importActual<typeof import('motion/react')>('motion/react')),
  useIsPresent: () => presence.current,
}));
beforeEach(() => {
  presence.current = true;
});

describe('stepSwapTiming', () => {
  it('respects speed multipliers and disables duration for reduced motion', () => {
    expect(stepSwapTiming(1.4).duration).toBeCloseTo(0.308);
    expect(stepSwapTiming(0.6).duration).toBeCloseTo(0.132);
    expect(stepSwapTiming(0).duration).toBe(0);
  });
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

  it('makes a departing step unavailable to keyboard and screen readers', () => {
    const { rerender } = render(
      <StepSwap stepKey="first">
        <button>Old choice</button>
      </StepSwap>,
    );
    presence.current = false;
    rerender(
      <StepSwap stepKey="first">
        <button>Old choice</button>
      </StepSwap>,
    );
    const old = screen.getByText('Old choice').parentElement;
    expect(old).toHaveAttribute('inert');
    expect(old).toHaveAttribute('aria-hidden', 'true');
  });
  it('renders the current step', () => {
    render(
      <StepSwap stepKey="picker">
        <p>Which course?</p>
      </StepSwap>,
    );
    expect(screen.getByText('Which course?')).toBeInTheDocument();
  });

  it('applies className to the step surface', () => {
    const { container } = render(
      <StepSwap stepKey="picker" className="flex flex-col gap-3">
        <p>Which course?</p>
      </StepSwap>,
    );
    expect(container.querySelector('.flex.flex-col.gap-3')).not.toBeNull();
  });
});
