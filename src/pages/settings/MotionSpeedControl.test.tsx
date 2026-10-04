import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { MotionSpeed } from '../../state/motionSpeed';
import { MotionSpeedControl } from './MotionSpeedControl';

function Harness({ initial = 'normal' }: { initial?: MotionSpeed }) {
  const [value, setValue] = useState<MotionSpeed>(initial);
  return <MotionSpeedControl value={value} onChange={setValue} />;
}

describe('MotionSpeedControl', () => {
  it('shows all three choices and marks the chosen one', () => {
    render(<Harness />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Fast' }));

    expect(screen.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'false');
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

  it('keeps only the chosen option in the tab order', () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Slow' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radiogroup', { name: 'Animation speed' })).toHaveClass('rounded-full');
  });
});
