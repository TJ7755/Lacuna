import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { scaledSpring } from './motion';

beforeEach(() => localStorage.clear());

describe('Button', () => {
  it('scales shared springs and makes reduced motion immediate', () => {
    expect(scaledSpring(2, 400, 30)).toEqual({
      type: 'spring',
      stiffness: 100,
      damping: 15,
    });
    expect(scaledSpring(0, 400, 30)).toEqual({ duration: 0 });
  });

  it('renders with default variant', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies custom className', () => {
    const { container } = render(<Button className="custom-class">Styled</Button>);
    expect(container.querySelector('button')).toHaveClass('custom-class');
  });

  it('renders different sizes', () => {
    const { container: sm } = render(<Button size="sm">Small</Button>);
    const { container: lg } = render(<Button size="lg">Large</Button>);
    expect(sm.querySelector('button')).toHaveClass('min-h-11');
    expect(lg.querySelector('button')).toHaveClass('min-h-11');
  });

  it('scales its CSS transition from the global motion setting', () => {
    localStorage.setItem('lacuna.motionSpeed', 'slow');
    render(<Button>Slow button</Button>);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? '0ms'
      : '210ms';
    expect(screen.getByRole('button', { name: 'Slow button' })).toHaveStyle({
      transitionDuration: duration,
    });
  });
});
