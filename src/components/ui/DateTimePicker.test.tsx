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

    fireEvent.click(screen.getByRole('button', { name: 'Open month selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open year selector' }));
    fireEvent.click(screen.getByRole('button', { name: '2027' }));
    fireEvent.click(screen.getByRole('button', { name: 'March' }));

    expect(screen.getByText('March 2027')).toBeInTheDocument();
  });

  it('pages the header by month, year or a visible nine-year range', () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open month selector' }));
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByText('2027')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open year selector' }));
    expect(screen.getByRole('button', { name: 'Previous nine years' })).toBeInTheDocument();
    expect(screen.getByText('2023–2031')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next nine years' }));
    expect(screen.getByText('2032–2040')).toBeInTheDocument();
  });

  it('provides roving keyboard selection in the month and year grids', async () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Open month selector' }));
    const june = await screen.findByRole('button', { name: 'June' });
    await waitFor(() => expect(june).toHaveFocus());
    fireEvent.keyDown(june, { key: 'ArrowRight' });
    const july = screen.getByRole('button', { name: 'July' });
    expect(july).toHaveFocus();
    fireEvent.keyDown(july, { key: 'ArrowDown' });
    const october = screen.getByRole('button', { name: 'October' });
    expect(october).toHaveFocus();
    fireEvent.keyDown(october, { key: 'Enter' });
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '1 October 2026' })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open month selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open year selector' }));
    const currentYear = await screen.findByRole('button', { name: '2026' });
    await waitFor(() => expect(currentYear).toHaveFocus());
    fireEvent.keyDown(currentYear, { key: 'ArrowRight' });
    const nextYear = screen.getByRole('button', { name: '2027' });
    expect(nextYear).toHaveFocus();
    fireEvent.keyDown(nextYear, { key: 'ArrowDown' });
    const finalYear = screen.getByRole('button', { name: '2030' });
    expect(finalYear).toHaveFocus();
    fireEvent.keyDown(finalYear, { key: ' ' });
    const selectedMonth = await screen.findByRole('button', { name: 'October' });
    await waitFor(() => expect(selectedMonth).toHaveFocus());
    expect(screen.getByText('2030')).toBeInTheDocument();
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

  it('commits a valid time draft before an outside close', () => {
    const onChange = vi.fn();
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Pick a date' });
    openPicker();

    fireEvent.change(screen.getByRole('textbox', { name: 'Hour' }), { target: { value: '9' } });
    fireEvent.pointerDown(document.body);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(Date.UTC(2026, 5, 10, 9, 30));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the picker open when an outside close encounters an invalid time draft', () => {
    const onChange = vi.fn();
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Pick a date' });
    openPicker();

    fireEvent.change(screen.getByRole('textbox', { name: 'Hour' }), { target: { value: '24' } });
    fireEvent.pointerDown(document.body);

    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
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

  it('uses roving focus within the day grid without hijacking the time fields', async () => {
    render(<ControlledPicker initialValue={Date.UTC(2026, 5, 10, 14, 30)} />);
    openPicker();

    const selectedDay = screen.getByRole('button', { name: '10 June 2026' });
    await waitFor(() => expect(selectedDay).toHaveFocus());
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
