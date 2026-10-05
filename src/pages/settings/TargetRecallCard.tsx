// Target recall for a course: the requestRetention figure shown large, with a slider and
// three named presets. The slider tracks a drag live via `onChange` but only writes through
// `onCommit`, fired once when the drag or keyboard interaction ends (or a preset is picked),
// so dragging does not write on every intermediate tick.

import { m as motion } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import {
  DEFAULT_REQUEST_RETENTION,
  MAX_REQUEST_RETENTION,
  MIN_REQUEST_RETENTION,
} from '../../fsrs/params';

/** Named anchor points for the target-retention slider. */
const RETENTION_PRESETS = [
  { label: 'Relaxed', value: 0.85 },
  { label: 'Balanced', value: 0.9 },
  { label: 'Thorough', value: 0.95 },
] as const;

export function TargetRecallCard({
  retention,
  onChange,
  onCommit,
}: {
  retention: number;
  /** Updates the live figure as the slider is dragged; does not commit. */
  onChange: (value: number) => void;
  /** Commits the value once the drag or keyboard interaction ends, or a preset is picked. */
  onCommit: (value: number) => void;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const percent = Math.round(retention * 100);
  const note =
    retention > DEFAULT_REQUEST_RETENTION
      ? 'More thorough than the default: more reviews, fewer lapses.'
      : retention < DEFAULT_REQUEST_RETENTION
        ? 'Lighter than the default: fewer reviews, more forgetting.'
        : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold text-ink">Target recall</h3>
        <motion.span
          key={percent}
          initial={multiplier > 0 ? { scale: 1.08 } : false}
          animate={{ scale: 1 }}
          transition={scaledSpring(multiplier, 520, 22)}
          className="font-display text-5xl font-semibold tracking-tight text-ink tabular-nums"
        >
          {percent}%
        </motion.span>
      </div>
      <input
        type="range"
        min={MIN_REQUEST_RETENTION}
        max={MAX_REQUEST_RETENTION}
        step={0.01}
        value={retention}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
        aria-label="Target retention"
        className="mt-4 h-11 w-full accent-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {RETENTION_PRESETS.map((preset) => {
          const active = percent === Math.round(preset.value * 100);
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => onCommit(preset.value)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                active ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-soft hover:text-ink',
              )}
            >
              {preset.label}
              <span className="font-normal opacity-70 tabular-nums">
                {Math.round(preset.value * 100)}%
              </span>
            </button>
          );
        })}
      </div>
      {note && <p className="mt-3 text-sm text-ink-soft">{note}</p>}
    </div>
  );
}
