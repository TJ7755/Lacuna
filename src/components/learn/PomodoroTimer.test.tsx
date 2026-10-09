import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PomodoroTimer } from './PomodoroTimer';

let formattedTime = '24:54';

vi.mock('../../hooks/PomodoroContext', () => ({
  useOptionalPomodoroContext: () => ({
    phase: 'focus',
    isRunning: true,
    progress: 0.5,
    formattedTime,
    sessionsCompleted: 0,
    startFocus: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    breakPending: false,
    acceptBreak: vi.fn(),
    deferBreak: vi.fn(),
  }),
}));

vi.mock('../../hooks/usePomodoro', () => ({
  usePomodoro: vi.fn(),
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

describe('PomodoroTimer', () => {
  it('keeps the compact time label inside its unchanged hit target and ring', () => {
    const { rerender } = render(<PomodoroTimer />);

    const button = screen.getByRole('button', { name: 'Focus · 24:54' });
    expect(button).toHaveClass('h-11', 'w-11');
    expect(button.querySelector('circle')).toBeInTheDocument();
    expect(button.querySelector('text')).toHaveAttribute('font-size', '8');

    formattedTime = '120:00';
    rerender(<PomodoroTimer />);

    expect(
      screen.getByRole('button', { name: 'Focus · 120:00' }).querySelector('text'),
    ).toHaveAttribute('font-size', '7');
  });
});


it('moves focus into the timer, wraps Tab and returns focus on Escape', () => {
  render(<PomodoroTimer />);
  const trigger = screen.getByRole('button', { name: /^Focus ·/ });
  trigger.focus();
  fireEvent.click(trigger);
  const pause = screen.getByRole('button', { name: 'Pause' });
  const reset = screen.getByRole('button', { name: 'Reset' });
  expect(document.activeElement).toBe(pause);
  reset.focus();
  fireEvent.keyDown(reset, { key: 'Tab' });
  expect(document.activeElement).toBe(pause);
  fireEvent.keyDown(pause, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(reset);
  fireEvent.keyDown(reset, { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
});
