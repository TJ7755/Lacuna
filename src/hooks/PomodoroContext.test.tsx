import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroProvider, usePomodoroContext } from './PomodoroContext';
import { savePomodoroSettings } from './usePomodoro';

function Step({ name }: { name: string }) {
  const pomodoro = usePomodoroContext();
  return (
    <div>
      <span>{name}</span>
      <span>{pomodoro.formattedTime}</span>
      <button type="button" onClick={pomodoro.startFocus}>
        Start focus
      </button>
    </div>
  );
}

function FlowHarness() {
  const [step, setStep] = useState('Lesson');
  return (
    <PomodoroProvider>
      <button type="button" onClick={() => setStep('Practice')}>
        Next step
      </button>
      <Step key={step} name={step} />
    </PomodoroProvider>
  );
}

describe('PomodoroProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps timer ownership across study-step remounts', () => {
    savePomodoroSettings({ workMinutes: 1 });
    render(<FlowHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('00:55')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByText('00:55')).toBeInTheDocument();
  });
});
