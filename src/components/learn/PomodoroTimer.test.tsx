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

  it('opens a named timer panel from a round trigger that reports its state', () => {
    formattedTime = '24:54';
    render(<PomodoroTimer />);
    const button = screen.getByRole('button', { name: 'Focus · 24:54' });
    expect(button).toHaveClass('rounded-full');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Pomodoro timer' });
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset timer' })).toHaveClass('rounded-full');
  });
});
