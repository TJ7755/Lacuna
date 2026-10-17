import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function Harness() {
  const ref = useFocusTrap(true);
  return (
    <div ref={ref}>
      <button data-dialog-close>Close</button>
      <input aria-label="Name" />
    </div>
  );
}

describe('useFocusTrap initial focus', () => {
  it('skips the dialog close button and focuses the first field', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });
});
