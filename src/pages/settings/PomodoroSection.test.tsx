import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPomodoroSettings } from '../../hooks/usePomodoro';
import { PomodoroSection } from './PomodoroSection';

beforeEach(() => localStorage.clear());

describe('PomodoroSection duration limits', () => {
  it.each([
    ['Short break', 'shortBreakMinutes'],
    ['Long break', 'longBreakMinutes'],
  ] as const)('keeps %s within the timer maximum', (label, setting) => {
    render(<PomodoroSection />);
    const input = screen.getByRole('spinbutton', { name: `${label} duration, in minutes` });

    fireEvent.change(input, { target: { value: '90' } });

    expect(input).toHaveValue(60);
    expect(input).toHaveAttribute('max', '60');
    expect(loadPomodoroSettings()[setting]).toBe(60);
  });

  it('retains the longer focus duration', () => {
    render(<PomodoroSection />);
    const input = screen.getByRole('spinbutton', { name: 'Focus duration, in minutes' });
    fireEvent.change(input, { target: { value: '90' } });
    expect(input).toHaveValue(90);
    expect(loadPomodoroSettings().workMinutes).toBe(90);
  });
});
