import { useEffect } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Burst } from '../../components/ui/Celebration';
import { FlameIcon } from '../../components/ui/icons';

export interface StreakMoment {
  run: number;
  key: number;
}

/**
 * A brief pop above the card when a run of correct answers reaches a milestone.
 * It never takes focus or pointer input and clears itself.
 */
export function StreakCelebration({
  moment,
  multiplier,
  onDone,
}: {
  moment: StreakMoment | null;
  multiplier: number;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!moment) return;
    const timer = window.setTimeout(onDone, Math.max(900, 1700 * multiplier));
    return () => window.clearTimeout(timer);
  }, [moment, multiplier, onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-30 flex justify-center">
      <span role="status" className="sr-only">
        {moment ? `${moment.run} in a row` : ''}
      </span>
      <AnimatePresence>
        {moment && (
          <motion.div
            key={moment.key}
            aria-hidden="true"
            className="relative inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-display text-base font-semibold text-paper shadow-[0_18px_40px_-18px_hsl(var(--ink)/0.6)]"
            initial={multiplier > 0 ? { opacity: 0, y: 16, scale: 0.6 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={multiplier > 0 ? { opacity: 0, y: -10, scale: 0.9 } : undefined}
            transition={
              multiplier > 0
                ? { type: 'spring', stiffness: 520, damping: 18 }
                : { duration: 0 }
            }
          >
            <Burst trigger={moment.key} multiplier={multiplier} count={16} spread={80} />
            <motion.span
              className="text-accent"
              initial={multiplier > 0 ? { rotate: -20, scale: 0.5 } : false}
              animate={{ rotate: [-20, 14, 0], scale: [0.5, 1.3, 1] }}
              transition={{ duration: 0.6 * multiplier, delay: 0.08 * multiplier }}
            >
              <FlameIcon width={18} height={18} />
            </motion.span>
            {moment.run} in a row
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
