import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FadeInView } from './FadeInView';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

describe('FadeInView', () => {
  it('renders immediately visible content with reduced motion', () => {
    const { container } = render(
      <FadeInView>
        <button>Continue</button>
      </FadeInView>,
    );
    expect(container.firstChild).not.toHaveStyle({ opacity: '0' });
    expect(container.firstChild).not.toHaveStyle({ transform: 'translateY(16px)' });
  });
});
