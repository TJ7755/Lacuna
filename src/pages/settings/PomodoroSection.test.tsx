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
});
