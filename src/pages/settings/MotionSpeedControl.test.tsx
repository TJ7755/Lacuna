import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { MotionSpeed } from '../../state/motionSpeed';
import { MotionSpeedControl } from './MotionSpeedControl';

function Harness({ initial = 'normal' }: { initial?: MotionSpeed }) {
  const [value, setValue] = useState<MotionSpeed>(initial);
  return <MotionSpeedControl value={value} onChange={setValue} describedBy="description" />;
}

describe('MotionSpeedControl', () => {
  it('shows all three choices and moves the track indicator immediately', () => {
    render(<Harness />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('motion-speed-fill')).toHaveClass('w-1/2');
    expect(screen.getByTestId('motion-speed-thumb')).toHaveClass('left-1/2');

    fireEvent.click(screen.getByRole('radio', { name: 'Fast' }));

    expect(screen.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('motion-speed-fill')).toHaveClass('w-full');
    expect(screen.getByTestId('motion-speed-thumb')).toHaveClass('left-full');
  });

  it('supports wrapping arrows plus Home and End', () => {
    render(<Harness initial="fast" />);

    const fast = screen.getByRole('radio', { name: 'Fast' });
    fireEvent.keyDown(fast, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Slow' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Slow' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Slow' }), { key: 'End' });
    expect(fast).toHaveFocus();

    fireEvent.keyDown(fast, { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'Slow' })).toHaveFocus();
  });

  it('animates only the compact track indicator and disables interpolation for reduced motion', () => {
    render(<Harness />);

    const group = screen.getByRole('radiogroup', { name: 'Animation speed' });
    const fill = screen.getByTestId('motion-speed-fill');
    const thumb = screen.getByTestId('motion-speed-thumb');

    expect(group).toHaveClass('h-12');
    expect(group).not.toHaveClass('border', 'rounded-xl');
    expect(fill).toHaveClass('transition-[width]', 'duration-200', 'motion-reduce:transition-none');
    expect(thumb).toHaveClass('transition-[left]', 'duration-200', 'motion-reduce:transition-none');
    expect(screen.getByRole('radio', { name: 'Normal' })).not.toHaveClass('bg-surface', 'shadow-sm');
  });
});
