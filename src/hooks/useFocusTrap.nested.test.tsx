import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';
function Picker() {
  const ref = useFocusTrap(true);
  return (
    <div ref={ref} role="dialog" aria-label="Picker">
      <button>First choice</button>
      <button>Last choice</button>
    </div>
  );
}
function Editor() {
  const ref = useFocusTrap(true);
  const [open, setOpen] = useState(false);
  return (
    <div ref={ref}>
      <div role="dialog" aria-label="Editor">
        <input aria-label="Name" />
        <button onClick={() => setOpen(true)}>Open picker</button>
      </div>
      {open && <Picker />}
    </div>
  );
}
it('lets a nested picker own Tab rather than wrapping to the editor behind it', () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
  const last = screen.getByRole('button', { name: 'Last choice' });
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'First choice' })).toHaveFocus();
});
