import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedDisclosure, animatedDisclosureTiming } from './AnimatedDisclosure';

describe('animatedDisclosureTiming', () => {
  it('follows the global speed and reduced-motion multipliers', () => {
    expect(animatedDisclosureTiming(1.4).duration).toBeCloseTo(0.308);
    expect(animatedDisclosureTiming(0.6).duration).toBeCloseTo(0.132);
    expect(animatedDisclosureTiming(0).duration).toBe(0);
  });
});

describe('AnimatedDisclosure', () => {
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
