import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders a hidden pulsing block with the default shape and tone', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    const block = container.firstElementChild!;
    expect(block.tagName).toBe('DIV');
    expect(block).toHaveAttribute('aria-hidden', 'true');
    expect(block).toHaveClass('h-4', 'w-24', 'animate-pulse', 'rounded', 'bg-ink/10');
  });

  it('lets an explicit shape and tone replace the defaults', () => {
    const { container } = render(<Skeleton as="span" className="h-6 rounded-2xl bg-ink/5" />);
    const block = container.firstElementChild!;
    expect(block.tagName).toBe('SPAN');
    expect(block).toHaveClass('rounded-2xl', 'bg-ink/5');
    expect(block).not.toHaveClass('rounded', 'bg-ink/10');
  });
});
