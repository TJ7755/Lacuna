import type { ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { cn } from '../ui/cn';

/** A titled container giving every chart a consistent frame and empty state. */
export function ChartCard({
  title,
  description,
  empty,
  emptyMessage,
  children,
  delay = 0,
  className,
  compactEmpty = false,
}: {
  title: string;
  description?: string;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Use for explanatory empty states that do not need to reserve chart height. */
  compactEmpty?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const d = delay ?? 0;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <header className="mb-4">
        <h3 className="font-display text-xl tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </header>
      {empty ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 * m, delay: (d + 0.1) * m }}
          className={cn(
            'grid place-items-center text-sm text-ink-faint',
            compactEmpty ? 'min-h-24 py-6' : 'h-64 min-h-[14rem]',
            className,
          )}
        >
          {emptyMessage ?? 'Not enough data yet.'}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32 * m, delay: (d + 0.05) * m, ease: 'easeOut' }}
          // Use min-h instead of h so charts that need more vertical space
          // (e.g. with rotated x-axis labels) can grow without overflow,
          // and add min-w-0 so the chart doesn't push the grid track wider
          // than its share.
          className={cn('h-64 min-w-0', className)}
        >
          {children}
        </motion.div>
      )}
    </section>
  );
}
