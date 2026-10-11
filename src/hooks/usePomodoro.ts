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
  /** Optional for timers saved before active duration was retained. */
  phaseSeconds?: number;
  phase: PomodoroPhase;
  secondsLeft: number;
  sessionsCompleted: number;
  pendingBreakPhase: PomodoroBreakPhase | null;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
      return Math.ceil(s.workMinutes * 60);
    case 'shortBreak':
      return Math.ceil(s.shortBreakMinutes * 60);
    case 'longBreak':
      return Math.ceil(s.longBreakMinutes * 60);
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
      phaseSeconds: parsed.phaseSeconds === undefined
        ? undefined
        : Math.max(0, Math.ceil(toNumber(parsed.phaseSeconds, 0))),
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
  const deadlineRef = useRef<number | null>(null);
  const secondsLeftRef = useRef(secondsLeft);
  const hasMountedRef = useRef(false);

  // Preference changes apply to the next phase, never the active ring's denominator.
  const [phaseSeconds, setPhaseSeconds] = useState(() => Math.max(
    initialRuntime.current!.secondsLeft,
    initialRuntime.current!.phaseSeconds ?? phaseDuration(phase, settings),
  ));

  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  // The running countdown is deliberately ephemeral. Persist at phase and
  // pause/resume boundaries so a background timer does not serialise to
  // localStorage every second; a restored timer is paused on app start anyway.
  useEffect(() => {
    const persistRuntime = (captureDeadline = false) => {
      const remaining = captureDeadline && isRunning && deadlineRef.current !== null
        ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
        : secondsLeftRef.current;
      let runtime: PomodoroRuntime = {
        phaseSeconds,
        phase,
        secondsLeft: remaining,
        sessionsCompleted,
        pendingBreakPhase,
      };
      if (captureDeadline && isRunning && remaining === 0) {
        if (phase === 'focus') {
          const completed = sessionsCompleted + 1;
          runtime = {
            ...runtime,
            sessionsCompleted: completed,
            pendingBreakPhase: completed % 4 === 0 ? 'longBreak' : 'shortBreak',
          };
        } else {
          runtime = { ...runtime, phase: 'idle' };
        }
      }
      try {
        localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
      } catch {
        // Runtime persistence is optional; the timer still works without storage.
      }
    };
    if (hasMountedRef.current) persistRuntime();
    else hasMountedRef.current = true;

    // Closing a browser page does not unmount React. Capture its elapsed deadline.
    const onPageHide = () => persistRuntime(true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      persistRuntime();
    };
  }, [isRunning, pendingBreakPhase, phase, phaseSeconds, sessionsCompleted]);

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

  const beginCountdown = useCallback((seconds: number) => {
    deadlineRef.current = Date.now() + seconds * 1000;
    setSecondsLeft(seconds);
    setIsRunning(true);
  }, []);

  // Derive the countdown from elapsed time so background throttling cannot stretch a phase.
  useEffect(() => {
    if (!isRunning || secondsLeftRef.current <= 0) {
      clearTick();
      return;
    }
    intervalRef.current = window.setInterval(() => {
      if (deadlineRef.current !== null) {
        setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      }
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
    const fresh = loadPomodoroSettings();
    setSettings(fresh);
    setPhase('focus');
    setPendingBreakPhase(null);
    const seconds = phaseDuration('focus', fresh);
    setPhaseSeconds(seconds);
    beginCountdown(seconds);
  }, [beginCountdown]);

  const pause = useCallback(() => {
    clearTick();
    if (deadlineRef.current !== null) {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      deadlineRef.current = null;
      // A completed phase must still reach the normal break boundary.
      if (remaining === 0) return;
    }
    setIsRunning(false);
  }, [clearTick]);

  const resume = useCallback(() => {
    if (phase === 'idle' || pendingBreakPhase) return;
    // Phase completed while paused; restart the same phase.
    if (secondsLeft === 0) {
      const seconds = phaseDuration(phase, settings);
      setPhaseSeconds(seconds);
      beginCountdown(seconds);
    } else {
      beginCountdown(secondsLeft);
    }
  }, [secondsLeft, phase, settings, pendingBreakPhase, beginCountdown]);

  const acceptBreak = useCallback(() => {
    if (!pendingBreakPhase) return;
    clearTick();
    const fresh = loadPomodoroSettings();
    setSettings(fresh);
    setPhase(pendingBreakPhase);
    setPendingBreakPhase(null);
    const seconds = phaseDuration(pendingBreakPhase, fresh);
    setPhaseSeconds(seconds);
    beginCountdown(seconds);
  }, [clearTick, pendingBreakPhase, beginCountdown]);

  const deferBreak = useCallback(() => {
    if (!pendingBreakPhase) return;
    clearTick();
    setPendingBreakPhase(null);
    setPhase('idle');
    deadlineRef.current = null;
    setSecondsLeft(0);
    setIsRunning(false);
  }, [clearTick, pendingBreakPhase]);

  const reset = useCallback(() => {
    clearTick();
    setPhase('idle');
    deadlineRef.current = null;
    setSecondsLeft(0);
    setPendingBreakPhase(null);
    setIsRunning(false);
  }, [clearTick]);

  const progress =
    phase === 'idle' || secondsLeft === 0 ? 0 : 1 - secondsLeft / phaseSeconds;

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
