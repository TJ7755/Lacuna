import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepSwap, stepSwapTiming } from './StepSwap';

describe('stepSwapTiming', () => {
  it('respects speed multipliers and disables duration for reduced motion', () => {
    expect(stepSwapTiming(1.4).duration).toBeCloseTo(0.308);
    expect(stepSwapTiming(0.6).duration).toBeCloseTo(0.132);
    expect(stepSwapTiming(0).duration).toBe(0);
  });
});

describe('StepSwap', () => {
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
