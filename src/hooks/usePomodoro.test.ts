import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePomodoro,
  loadPomodoroSettings,
  savePomodoroSettings,
  type PomodoroSettings,
} from './usePomodoro';

const STORAGE_KEY = 'lacuna-pomodoro-settings';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadPomodoroSettings', () => {
  it('returns defaults when nothing is stored', () => {
    const settings = loadPomodoroSettings();
    expect(settings.workMinutes).toBe(25);
    expect(settings.shortBreakMinutes).toBe(5);
    expect(settings.longBreakMinutes).toBe(15);
    expect(settings.autoStartBreaks).toBe(false);
  });

  it('returns clamped values for stored settings', () => {
    const stored: Partial<PomodoroSettings> = {
      workMinutes: 200,
      shortBreakMinutes: 0,
      longBreakMinutes: 70,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const settings = loadPomodoroSettings();
    expect(settings.workMinutes).toBe(120);
    expect(settings.shortBreakMinutes).toBe(1);
    expect(settings.longBreakMinutes).toBe(60);
  });

  it('returns defaults on invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const settings = loadPomodoroSettings();
    expect(settings.workMinutes).toBe(25);
  });
});

describe('savePomodoroSettings', () => {
  it('persists settings to localStorage', () => {
    savePomodoroSettings({ workMinutes: 30 });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.workMinutes).toBe(30);
  });
});

describe('usePomodoro', () => {
  it('continues counting down when focus is restarted while running', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => result.current.startFocus());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => result.current.startFocus());
    expect(result.current.formattedTime).toBe('25:00');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formattedTime).toBe('24:59');
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.phase).toBe('idle');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.formattedTime).toBe('00:00');
  });

  it('starts focus phase and counts down', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => {
      result.current.startFocus();
    });
    expect(result.current.phase).toBe('focus');
    expect(result.current.isRunning).toBe(true);
    expect(result.current.formattedTime).toBe('25:00');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formattedTime).toBe('24:59');
  });

  it('pauses and resumes', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => {
      result.current.startFocus();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.formattedTime).toBe('24:55');

    act(() => {
      result.current.pause();
    });
    expect(result.current.isRunning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.formattedTime).toBe('24:55');

    act(() => {
      result.current.resume();
    });
    expect(result.current.isRunning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.formattedTime).toBe('24:54');
  });

  it('resets to idle', () => {
    const { result } = renderHook(() => usePomodoro());
    act(() => {
      result.current.startFocus();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.formattedTime).toBe('00:00');
  });

  it('waits at a safe boundary when a focus period expires', () => {
    savePomodoroSettings({ workMinutes: 1, autoStartBreaks: true });
    const { result } = renderHook(() => usePomodoro());

    act(() => result.current.startFocus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.phase).toBe('focus');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.breakPending).toBe(true);
    expect(result.current.pendingBreakPhase).toBe('shortBreak');
  });

  it('starts or defers a pending break explicitly', () => {
    savePomodoroSettings({ workMinutes: 1, shortBreakMinutes: 2 });
    const { result } = renderHook(() => usePomodoro());

    act(() => result.current.startFocus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    act(() => result.current.acceptBreak());

    expect(result.current.phase).toBe('shortBreak');
    expect(result.current.formattedTime).toBe('02:00');
    expect(result.current.isRunning).toBe(true);
    expect(result.current.breakPending).toBe(false);

    act(() => result.current.reset());
    act(() => result.current.startFocus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    act(() => result.current.deferBreak());

    expect(result.current.phase).toBe('idle');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.breakPending).toBe(false);
  });

  it('restores persisted runtime in a paused state', () => {
    savePomodoroSettings({ workMinutes: 1 });
    const first = renderHook(() => usePomodoro());
    act(() => first.result.current.startFocus());
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(first.result.current.formattedTime).toBe('00:55');
    first.unmount();

    const restored = renderHook(() => usePomodoro());
    expect(restored.result.current.phase).toBe('focus');
    expect(restored.result.current.formattedTime).toBe('00:55');
    expect(restored.result.current.isRunning).toBe(false);
  });
});


it('counts elapsed time when background callbacks are delayed', () => {
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  act(() => {
    vi.setSystemTime(Date.now() + 60_000);
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.formattedTime).toBe('23:59');
});

it('records a completed focus phase after a delayed background tick', () => {
  savePomodoroSettings({ workMinutes: 1 });
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  act(() => {
    vi.setSystemTime(Date.now() + 120_000);
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.secondsLeft).toBe(0);
  expect(result.current.sessionsCompleted).toBe(1);
  expect(result.current.breakPending).toBe(true);
  expect(result.current.isRunning).toBe(false);
});

it('pauses at the elapsed countdown even before the next delayed tick', () => {
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  act(() => {
    vi.setSystemTime(Date.now() + 60_000);
    result.current.pause();
  });
  expect(result.current.formattedTime).toBe('24:00');
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(result.current.formattedTime).toBe('24:00');
  act(() => result.current.resume());
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.formattedTime).toBe('23:59');
});

it('recovers a finite paused timer from corrupted non-finite runtime values', () => {
  localStorage.setItem(
    'lacuna-pomodoro-runtime',
    '{"phase":"focus","secondsLeft":1e309,"sessionsCompleted":1e309}',
  );
  const { result } = renderHook(() => usePomodoro());
  expect(result.current.secondsLeft).toBe(0);
  expect(result.current.sessionsCompleted).toBe(0);
  expect(result.current.formattedTime).toBe('00:00');
  act(() => result.current.resume());
  expect(result.current.formattedTime).toBe('25:00');
});

it('saves the elapsed countdown when the page closes before another tick', () => {
  const first = renderHook(() => usePomodoro());
  act(() => first.result.current.startFocus());
  act(() => {
    vi.setSystemTime(Date.now() + 65_000);
    window.dispatchEvent(new Event('pagehide'));
  });
  const restored = renderHook(() => usePomodoro());
  expect(restored.result.current.formattedTime).toBe('23:55');
  expect(restored.result.current.isRunning).toBe(false);
});

it('uses the latest saved duration when accepting a pending break', () => {
  savePomodoroSettings({ workMinutes: 1 });
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  savePomodoroSettings({ shortBreakMinutes: 8 });
  act(() => result.current.acceptBreak());
  expect(result.current.formattedTime).toBe('08:00');
  expect(result.current.settings.shortBreakMinutes).toBe(8);
  expect(result.current.progress).toBe(0);
});

it('starts fractional-minute phases with whole seconds in the countdown', () => {
  savePomodoroSettings({ workMinutes: 1.001 });
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  expect(result.current.secondsLeft).toBe(61);
  expect(result.current.formattedTime).toBe('01:01');
  expect(result.current.progress).toBe(0);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(result.current.formattedTime).toBe('01:00');
});

it('restores a pending break when focus expired before the closing page could tick', () => {
  savePomodoroSettings({ workMinutes: 1 });
  const first = renderHook(() => usePomodoro());
  act(() => first.result.current.startFocus());
  act(() => {
    vi.setSystemTime(Date.now() + 90_000);
    window.dispatchEvent(new Event('pagehide'));
  });
  const restored = renderHook(() => usePomodoro());
  expect(restored.result.current.secondsLeft).toBe(0);
  expect(restored.result.current.sessionsCompleted).toBe(1);
  expect(restored.result.current.pendingBreakPhase).toBe('shortBreak');
  expect(restored.result.current.isRunning).toBe(false);
  act(() => restored.result.current.resume());
  expect(restored.result.current.isRunning).toBe(false);
});

it('keeps a paused countdown unchanged when the page closes later', () => {
  const first = renderHook(() => usePomodoro());
  act(() => first.result.current.startFocus());
  act(() => {
    vi.advanceTimersByTime(5_000);
  });
  act(() => first.result.current.pause());
  act(() => {
    vi.setSystemTime(Date.now() + 65_000);
    window.dispatchEvent(new Event('pagehide'));
  });
  const restored = renderHook(() => usePomodoro());
  expect(restored.result.current.formattedTime).toBe('24:55');
  expect(restored.result.current.isRunning).toBe(false);
});

it('keeps the active progress ring stable when another tab changes durations', () => {
  const { result } = renderHook(() => usePomodoro());
  act(() => result.current.startFocus());
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  const progress = result.current.progress;
  act(() => {
    savePomodoroSettings({ workMinutes: 1 });
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  });
  expect(result.current.settings.workMinutes).toBe(1);
  expect(result.current.formattedTime).toBe('24:00');
  expect(result.current.progress).toBe(progress);
});

it('restores idle when a break expired before the closing page could tick', () => {
  savePomodoroSettings({ workMinutes: 1, shortBreakMinutes: 1 });
  const first = renderHook(() => usePomodoro());
  act(() => first.result.current.startFocus());
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  act(() => first.result.current.acceptBreak());
  act(() => {
    vi.setSystemTime(Date.now() + 90_000);
    window.dispatchEvent(new Event('pagehide'));
  });
  const restored = renderHook(() => usePomodoro());
  expect(restored.result.current.phase).toBe('idle');
  expect(restored.result.current.secondsLeft).toBe(0);
  expect(restored.result.current.sessionsCompleted).toBe(1);
  expect(restored.result.current.isRunning).toBe(false);
});
