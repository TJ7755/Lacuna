import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

function setup(value = 25) {
  const onCommit = vi.fn();
  render(<NumberField label="Focus" value={value} min={1} max={120} onCommit={onCommit} />);
  return { input: screen.getByRole('spinbutton', { name: 'Focus' }), onCommit };
}

describe('NumberField', () => {
  it('commits on Enter, not while typing', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.change(input, { target: { value: '45' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(45);
  });

  it.each(['', '0', '121', '2.5'])('keeps %j unsaved and explains the bounds', (draft) => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a whole number from 1 to 120.');
  });

  it('restores the saved value on Escape', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue(25);
    expect(input).not.toHaveAttribute('aria-invalid');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
