import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('renders a native select with its options', () => {
    render(
      <Select aria-label="Course">
        <option value="one">Course one</option>
        <option value="two">Course two</option>
      </Select>,
    );

    expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('one');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('forwards change events', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Course" onChange={onChange}>
        <option value="one">Course one</option>
        <option value="two">Course two</option>
      </Select>,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } });

    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByRole('combobox')).toHaveValue('two');
  });

  it('supports disabled state and custom classes', () => {
    render(
      <Select aria-label="Course" className="w-full" disabled>
        <option>Course one</option>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveClass('min-h-11', 'w-full');
  });

  it('forwards its ref', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="Course">
        <option>Course one</option>
      </Select>,
    );

    expect(ref.current).toBe(screen.getByRole('combobox'));
  });
});
