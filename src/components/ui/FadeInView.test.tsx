import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('renders children', () => {
    render(
      <FadeInView>
        <div data-testid="content">Hello</div>
      </FadeInView>,
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <FadeInView className="custom-class">
        <div>Content</div>
      </FadeInView>,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
