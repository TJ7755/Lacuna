import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { arrivalDelay, PillSwitch } from './SettingsUi';

describe('arrivalDelay', () => {
  it('steps by 40 ms, capped, and scales with the motion multiplier', () => {
    expect(arrivalDelay(0, 1)).toBe(0);
    expect(arrivalDelay(3, 1)).toBeCloseTo(0.12);
    expect(arrivalDelay(40, 1)).toBeCloseTo(0.32);
    expect(arrivalDelay(3, 2)).toBeCloseTo(0.24);
    expect(arrivalDelay(3, 0)).toBe(0);
  });
});

describe('PillSwitch', () => {
  it('toggles through a named switch and ignores clicks while disabled', () => {
    const onChange = vi.fn();
    const view = render(
      <PillSwitch checked={false} onChange={onChange} ariaLabel="Compact mode" />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Compact mode' }));
    expect(onChange).toHaveBeenCalledWith(true);

    view.rerender(<PillSwitch checked onChange={onChange} ariaLabel="Compact mode" disabled />);
    fireEvent.click(screen.getByRole('switch', { name: 'Compact mode' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch', { name: 'Compact mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
