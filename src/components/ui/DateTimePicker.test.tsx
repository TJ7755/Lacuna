import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DateTimePicker } from './DateTimePicker';

function ControlledPicker({
  initialValue,
  onChange,
  timeZone = 'UTC',
}: {
  initialValue: number;
  onChange?: (value: number) => void;
  timeZone?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <DateTimePicker
      value={value}
      timeZone={timeZone}
      label="Pick a date"
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
}

describe('DateTimePicker', () => {
  it('renders an accessibly labelled trigger with the formatted value', () => {
    render(
      <DateTimePicker
        value={Date.UTC(2026, 5, 10, 14, 30)}
        timeZone="UTC"
        onChange={vi.fn()}
        label="Pick a date"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Pick a date' });
    expect(trigger).toHaveTextContent('10 Jun 2026 · 14:30');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('navigates across year boundaries without snapping back', () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 11, 10, 14, 30)} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('January 2027')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('November 2026')).toBeInTheDocument();
  });

  it('keeps a chosen month and year instead of resetting to the selected date', () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Open month and year selector' }));
    fireEvent.click(screen.getByRole('button', { name: '2026' }));
    fireEvent.click(screen.getByRole('button', { name: '2027' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }));

    expect(screen.getByText('March 2027')).toBeInTheDocument();
  });

  it('keeps the popover open after selecting a day and preserves the time', () => {
    const onChange = vi.fn();
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} onChange={onChange} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: '20 June 2026' }));

    expect(onChange).toHaveBeenLastCalledWith(Date.UTC(2026, 5, 20, 14, 30));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('allows incomplete time text while editing and commits a valid time on blur', () => {
    const onChange = vi.fn();
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} onChange={onChange} />);
    openPicker();
    const hour = screen.getByRole('textbox', { name: 'Hour' });

    fireEvent.change(hour, { target: { value: '' } });
    expect(hour).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(hour, { target: { value: '9' } });
    fireEvent.blur(hour);
    expect(onChange).toHaveBeenLastCalledWith(Date.UTC(2026, 5, 10, 9, 30));
    expect(hour).toHaveValue('09');
  });

  it('does not emit an invalid time', () => {
    const onChange = vi.fn();
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} onChange={onChange} />);
    openPicker();

    const hour = screen.getByRole('textbox', { name: 'Hour' });
    fireEvent.change(hour, { target: { value: '24' } });
    fireEvent.blur(hour);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid 24-hour time.');
  });

  it('does not emit a nonexistent daylight-saving wall time', () => {
    const onChange = vi.fn();
    render(
      <ControlledPicker
        initialValue={Date.parse('2026-03-07T07:30:00Z')}
        onChange={onChange}
        timeZone="America/New_York"
      />,
    );
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: '8 March 2026' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('does not exist');
  });

  it('uses roving focus within the day grid without hijacking the time fields', () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    openPicker();

    const selectedDay = screen.getByRole('button', { name: '10 June 2026' });
    expect(selectedDay).toHaveFocus();
    fireEvent.keyDown(selectedDay, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: '11 June 2026' })).toHaveFocus();

    const hour = screen.getByRole('textbox', { name: 'Hour' });
    hour.focus();
    expect(fireEvent.keyDown(hour, { key: 'ArrowLeft' })).toBe(true);
    expect(hour).toHaveFocus();
  });

  it('closes with Done or Escape and restores focus to the trigger', async () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    const trigger = screen.getByRole('button', { name: 'Pick a date' });
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    openPicker();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
