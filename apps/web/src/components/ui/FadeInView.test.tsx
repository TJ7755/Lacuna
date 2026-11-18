import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FadeInView } from './FadeInView';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

describe('FadeInView', () => {
  it('renders immediately visible content with reduced motion', () => {
    render(
      <FadeInView>
        <button>Continue</button>
      </FadeInView>,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });
});
