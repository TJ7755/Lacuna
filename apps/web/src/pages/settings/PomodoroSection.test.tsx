import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPomodoroSettings } from '../../hooks/usePomodoro';
import { PomodoroSection } from './PomodoroSection';

describe('PomodoroSection', () => {
  beforeEach(() => localStorage.clear());

  it('lets a duration be cleared and retyped, saving only the finished value', () => {
    render(<PomodoroSection />);
    const focus = screen.getByRole('spinbutton', { name: 'Focus duration, in minutes' });
    const before = loadPomodoroSettings().workMinutes;

    fireEvent.change(focus, { target: { value: '' } });
    expect(focus).toHaveValue(null);
    fireEvent.change(focus, { target: { value: '3' } });
    fireEvent.change(focus, { target: { value: '30' } });
    expect(focus).toHaveValue(30);
    expect(loadPomodoroSettings().workMinutes).toBe(before);

    fireEvent.blur(focus);
    expect(focus).toHaveValue(30);
    expect(loadPomodoroSettings().workMinutes).toBe(30);
  });

  it.each([
    ['Short break', 'shortBreakMinutes'],
    ['Long break', 'longBreakMinutes'],
  ] as const)('keeps %s within the timer maximum', (label, setting) => {
    render(<PomodoroSection />);
    const input = screen.getByRole('spinbutton', { name: `${label} duration, in minutes` });
    const before = loadPomodoroSettings()[setting];

    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.blur(input);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('max', '60');
    expect(loadPomodoroSettings()[setting]).toBe(before);

    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(60);
    expect(loadPomodoroSettings()[setting]).toBe(60);
  });

  it('retains the longer focus duration', () => {
    render(<PomodoroSection />);
    const input = screen.getByRole('spinbutton', { name: 'Focus duration, in minutes' });
    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(90);
    expect(loadPomodoroSettings().workMinutes).toBe(90);
  });
});
