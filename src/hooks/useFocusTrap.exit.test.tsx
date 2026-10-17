import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function Harness({ departing }: { departing: boolean }) {
  const ref = useFocusTrap(true);
  return (
    <div ref={ref} inert={departing}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe('useFocusTrap during exit', () => {
  it('does not intercept Tab while its animated dialog is inert and departing', () => {
    const { rerender } = render(<Harness departing={false} />);
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    rerender(<Harness departing />);
    const key = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(last, key);
    expect(key.defaultPrevented).toBe(false);
  });
});
