import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { usePomodoro } from '../../hooks/usePomodoro';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import {
  ClockIcon,
  PlayIcon,
  PauseIcon,
  CloseIcon,
} from '../ui/icons';

/* ─── geometry ─── */
const R = 14;
const C = 2 * Math.PI * R;

const BIG_R = 70;
const BIG_C = 2 * Math.PI * BIG_R;

/* ─── helpers ─── */
const label = (p: string) => {
  if (p === 'focus') return 'Focus';
  if (p === 'shortBreak') return 'Short break';
  if (p === 'longBreak') return 'Long break';
  return 'Pomodoro';
};

const colour = (p: string) => {
  if (p === 'focus') return 'text-accent';
  if (p === 'shortBreak') return 'text-positive';
  if (p === 'longBreak') return 'text-ink';
  return 'text-ink-faint';
};

const stroke = (p: string) => {
  if (p === 'focus') return 'stroke-accent';
  if (p === 'shortBreak') return 'stroke-positive';
  if (p === 'longBreak') return 'stroke-ink';
  return 'stroke-ink-faint';
};

/* ─── component ─── */
export function PomodoroTimer() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const p = usePomodoro();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* close on Esc or outside click */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPtr = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPtr);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPtr);
    };
  }, [open]);

  const {
    phase,
    isRunning,
    progress,
    formattedTime,
    sessionsCompleted,
    startFocus,
    pause,
    resume,
    reset,
  } = p;

  const active = phase !== 'idle';
  const dashOffset = C * (1 - progress);

  return (
    <div ref={ref} className="relative">
      {/* ===== Compact face ===== */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active ? `${label(phase)} · ${formattedTime}` : 'Pomodoro timer'}
        className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <svg width="36" height="36" viewBox="0 0 36 36" className="absolute inset-0">
          {/* track */}
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            className="stroke-ink-faint"
            strokeWidth="2"
            opacity={0.15}
          />
          {/* progress */}
          {active && (
            <motion.circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              className={stroke(phase)}
              strokeWidth="2"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 1 * m, ease: 'linear' }}
              transform="rotate(-90 18 18)"
            />
          )}
          {/* 12 o'clock tick */}
          <line
            x1="18"
            y1="3"
            x2="18"
            y2="5"
            className={active ? stroke(phase) : 'stroke-ink-faint'}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* time — rendered as SVG text for perfect centreing */}
          {active && (
            <text
              x="18"
              y="18"
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              className={`text-[10px] font-medium tabular ${colour(phase)}`}
            >
              {formattedTime}
            </text>
          )}
        </svg>

        {/* idle icon — only when timer is not running */}
        {!active && (
          <span className="absolute inset-0 flex items-center justify-center">
            <ClockIcon width={16} height={16} />
          </span>
        )}
      </button>

      {/* ===== Expanded popup ===== */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.12 * m, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xl shadow-black/10"
          >
            <div className="px-4 py-4">
              {/* header */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
                  {label(phase)}
                </span>
                {sessionsCompleted > 0 && (
                  <span className="text-[10px] tabular text-ink-faint">
                    {sessionsCompleted} session{sessionsCompleted === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {/* big circular timer */}
              <div className="relative mx-auto mb-5 flex h-40 w-40 items-center justify-center">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={BIG_R}
                    fill="none"
                    className="stroke-ink-faint"
                    strokeWidth="6"
                    opacity={0.12}
                  />
                  {active && (
                    <motion.circle
                      cx="80"
                      cy="80"
                      r={BIG_R}
                      fill="none"
                      className={stroke(phase)}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={BIG_C}
                      initial={{ strokeDashoffset: BIG_C }}
                      animate={{ strokeDashoffset: BIG_C * (1 - progress) }}
                      transition={{ duration: 1 * m, ease: 'linear' }}
                      transform="rotate(-90 80 80)"
                    />
                  )}
                  {/* 12 o'clock tick */}
                  <line
                    x1="80"
                    y1="8"
                    x2="80"
                    y2="14"
                    className={active ? stroke(phase) : 'stroke-ink-faint'}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* time — SVG text for perfect centreing */}
                  <text
                    x="80"
                    y="80"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="currentColor"
                    className={`font-display text-4xl tabular tracking-tight ${colour(phase)}`}
                  >
                    {formattedTime}
                  </text>
                </svg>
              </div>

              {/* controls */}
              <div className="flex justify-center gap-2">
                {!active && (
                  <button
                    type="button"
                    onClick={startFocus}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90"
                  >
                    <PlayIcon width={14} height={14} />
                    Start
                  </button>
                )}
                {active && (
                  <>
                    {isRunning ? (
                      <button
                        type="button"
                        onClick={pause}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                      >
                        <PauseIcon width={14} height={14} />
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={resume}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90"
                      >
                        <PlayIcon width={14} height={14} />
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={reset}
                      title="Reset"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                      <CloseIcon width={12} height={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
