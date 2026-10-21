import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PillSwitch } from './SettingsUi';

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
