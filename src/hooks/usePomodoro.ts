import { useCallback, useEffect, useRef, useState } from 'react';

export type PomodoroPhase = 'idle' | 'focus' | 'shortBreak' | 'longBreak';
export type PomodoroBreakPhase = 'shortBreak' | 'longBreak';

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  autoStartBreaks: boolean;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStartBreaks: false,
};

const STORAGE_KEY = 'lacuna-pomodoro-settings';
const RUNTIME_STORAGE_KEY = 'lacuna-pomodoro-runtime';

interface PomodoroRuntime {
  phase: PomodoroPhase;
  secondsLeft: number;
  sessionsCompleted: number;
  pendingBreakPhase: PomodoroBreakPhase | null;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

export function loadPomodoroSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
      return {
        workMinutes: Math.max(
          1,
          Math.min(120, toNumber(parsed.workMinutes, DEFAULT_SETTINGS.workMinutes)),
        ),
        shortBreakMinutes: Math.max(
          1,
          Math.min(60, toNumber(parsed.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes)),
        ),
        longBreakMinutes: Math.max(
          1,
          Math.min(60, toNumber(parsed.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes)),
        ),
        autoStartBreaks:
          typeof parsed.autoStartBreaks === 'boolean'
            ? parsed.autoStartBreaks
            : DEFAULT_SETTINGS.autoStartBreaks,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function phaseDuration(p: PomodoroPhase, s: PomodoroSettings): number {
  switch (p) {
    case 'focus':
      return s.workMinutes * 60;
    case 'shortBreak':
      return s.shortBreakMinutes * 60;
    case 'longBreak':
      return s.longBreakMinutes * 60;
    default:
      return 0;
  }
}

function loadPomodoroRuntime(): PomodoroRuntime {
  const fallback: PomodoroRuntime = {
    phase: 'idle',
    secondsLeft: 0,
    sessionsCompleted: 0,
    pendingBreakPhase: null,
  };
  try {
    const raw = localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PomodoroRuntime>;
    const phase: PomodoroPhase =
      parsed.phase === 'focus' || parsed.phase === 'shortBreak' || parsed.phase === 'longBreak'
        ? parsed.phase
        : 'idle';
    const pendingBreakPhase: PomodoroBreakPhase | null =
      parsed.pendingBreakPhase === 'shortBreak' || parsed.pendingBreakPhase === 'longBreak'
        ? parsed.pendingBreakPhase
        : null;
    return {
      phase,
      secondsLeft: Math.max(0, Math.floor(toNumber(parsed.secondsLeft, 0))),
      sessionsCompleted: Math.max(0, Math.floor(toNumber(parsed.sessionsCompleted, 0))),
      pendingBreakPhase,
    };
  } catch {
    return fallback;
  }
}

export function savePomodoroSettings(settings: Partial<PomodoroSettings>): void {
  try {
    const current = loadPomodoroSettings();
    const next = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function usePomodoro() {
  const initialRuntime = useRef<PomodoroRuntime | null>(null);
  if (initialRuntime.current === null) initialRuntime.current = loadPomodoroRuntime();
  const [settings, setSettings] = useState<PomodoroSettings>(loadPomodoroSettings);
  const [phase, setPhase] = useState<PomodoroPhase>(initialRuntime.current.phase);
  const [secondsLeft, setSecondsLeft] = useState(initialRuntime.current.secondsLeft);
  const [sessionsCompleted, setSessionsCompleted] = useState(
    initialRuntime.current.sessionsCompleted,
  );
  const [pendingBreakPhase, setPendingBreakPhase] = useState<PomodoroBreakPhase | null>(
    initialRuntime.current.pendingBreakPhase,
  );
  // Runtime restored after an app close is deliberately paused. Resuming must
  // always be an explicit action rather than a surprise countdown in the background.
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const secondsLeftRef = useRef(secondsLeft);

  const durationForPhase = useCallback(
    (p: PomodoroPhase) => {
      return phaseDuration(p, settings);
    },
    [settings],
  );

  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  useEffect(() => {
    try {
      const runtime: PomodoroRuntime = {
        phase,
        secondsLeft,
        sessionsCompleted,
        pendingBreakPhase,
      };
      localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    } catch {
      // Runtime persistence is optional; the timer still works without storage.
    }
  }, [pendingBreakPhase, phase, secondsLeft, sessionsCompleted]);

  // Sync settings when they change in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadPomodoroSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Tick down every second while running.
  useEffect(() => {
    if (!isRunning || secondsLeftRef.current <= 0) {
      clearTick();
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearTick();
  }, [isRunning, clearTick]);

  // Handle completion when timer hits zero.
  useEffect(() => {
    if (secondsLeft !== 0 || !isRunning) return;
    clearTick();
    setIsRunning(false);

    if (phase === 'focus') {
      const nextSessions = sessionsCompleted + 1;
      setSessionsCompleted(nextSessions);
      const nextPhase = nextSessions % 4 === 0 ? 'longBreak' : 'shortBreak';
      // A focus period may end halfway through a card. Record the break as
      // pending and let the study flow offer it at its next safe boundary.
      setPendingBreakPhase(nextPhase);
    } else {
      setPhase('idle');
      setSecondsLeft(0);
    }
  }, [secondsLeft, isRunning, phase, sessionsCompleted, clearTick]);

  const startFocus = useCallback(() => {
    clearTick();
    const fresh = loadPomodoroSettings();
    setSettings(fresh);
    setPhase('focus');
    setSecondsLeft(phaseDuration('focus', fresh));
    setPendingBreakPhase(null);
    setIsRunning(true);
  }, [clearTick]);

  const pause = useCallback(() => {
    clearTick();
    setIsRunning(false);
  }, [clearTick]);

  const resume = useCallback(() => {
    if (phase === 'idle' || pendingBreakPhase) return;
    if (secondsLeft === 0) {
      // Phase completed while paused; restart the same phase.
      setSecondsLeft(phaseDuration(phase, settings));
    }
    setIsRunning(true);
  }, [secondsLeft, phase, settings, pendingBreakPhase]);

  const acceptBreak = useCallback(() => {
    if (!pendingBreakPhase) return;
    clearTick();
    setPhase(pendingBreakPhase);
    setSecondsLeft(durationForPhase(pendingBreakPhase));
    setPendingBreakPhase(null);
    setIsRunning(true);
  }, [clearTick, durationForPhase, pendingBreakPhase]);

  const deferBreak = useCallback(() => {
    if (!pendingBreakPhase) return;
    clearTick();
    setPendingBreakPhase(null);
    setPhase('idle');
    setSecondsLeft(0);
    setIsRunning(false);
  }, [clearTick, pendingBreakPhase]);

  const reset = useCallback(() => {
    clearTick();
    setPhase('idle');
    setSecondsLeft(0);
    setPendingBreakPhase(null);
    setIsRunning(false);
  }, [clearTick]);

  const progress =
    phase === 'idle' || secondsLeft === 0 ? 0 : 1 - secondsLeft / durationForPhase(phase);

  const formattedTime = `${Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`;

  return {
    phase,
    secondsLeft,
    sessionsCompleted,
    isRunning,
    progress,
    formattedTime,
    startFocus,
    pause,
    resume,
    reset,
    breakPending: pendingBreakPhase !== null,
    pendingBreakPhase,
    acceptBreak,
    deferBreak,
    settings,
  };
}
