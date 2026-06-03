import { motion } from 'motion/react';
import { cn } from './cn';

interface ProgressBarProps {
  /** Completion fraction, 0..1. */
  value: number;
  className?: string;
  showLabel?: boolean;
  height?: number;
}

export function ProgressBar({
  value,
  className,
  showLabel = false,
  height = 10,
}: ProgressBarProps) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="relative flex-1 overflow-hidden rounded-full bg-ink/10"
        style={{ height }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>
      {showLabel && (
        <span className="tabular text-sm font-medium text-ink-soft w-12 text-right">
          {pct}%
        </span>
      )}
    </div>
  );
}
