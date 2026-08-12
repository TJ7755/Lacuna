import { m as motion } from 'motion/react';
import { cn } from './cn';

export type ProgressVariant = 'accent' | 'positive' | 'negative' | 'warning' | 'simple';

const variantClass: Record<ProgressVariant, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  negative: 'bg-negative',
  warning: 'bg-warning',
  simple: 'bg-positive',
};

interface ProgressBarProps {
  /** Completion fraction, 0..1. */
  value: number;
  className?: string;
  showLabel?: boolean;
  height?: number;
  /** Accessible name for screen readers. */
  label?: string;
  /** Visual colour variant of the filled bar. */
  variant?: ProgressVariant;
}

export function ProgressBar({
  value,
  className,
  showLabel = false,
  height = 10,
  label = 'Progress',
  variant = 'accent',
}: ProgressBarProps) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="relative flex-1 overflow-hidden rounded-full bg-ink/10"
        style={{ height }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0 w-full origin-left overflow-hidden rounded-full',
            variantClass[variant],
          )}
          initial={false}
          animate={{ scaleX: pct / 100 }}
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
