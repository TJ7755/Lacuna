import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedDisclosure, animatedDisclosureTiming } from './AnimatedDisclosure';
import { expandingActionSpring } from './motion';

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
