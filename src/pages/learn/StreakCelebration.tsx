import { useEffect } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { FlameIcon } from '../../components/ui/icons';
import { MOTION_EASING, motionTransition, scaledSpring } from '../../components/ui/motion';

export interface StreakMoment {
  run: number;
  key: number;
}

/**
 * A brief pop above the card when a run of correct answers reaches a milestone.
 * It sits on the raised surface like other floating chrome, so it reads in both
 * themes without shouting over the card. It never takes focus or pointer input
 * and clears itself.
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

  const animated = multiplier > 0;

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
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised py-2 pl-3 pr-4 font-display text-base font-semibold tabular-nums text-ink shadow-[0_8px_24px_hsl(var(--ink)/0.12)]"
            initial={animated ? { opacity: 0, y: 12, scale: 0.94 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animated ? { opacity: 0, y: -6 } : undefined}
            transition={{
              ...scaledSpring(multiplier, 420, 32),
              opacity: motionTransition('feedback', multiplier),
            }}
          >
            <motion.span
              className="text-accent-ink"
              initial={animated ? { scale: 0.6, rotate: -12 } : false}
              animate={{ scale: [0.6, 1.15, 1], rotate: [-12, 6, 0] }}
              transition={{
                duration: 0.5 * multiplier,
                delay: 0.06 * multiplier,
                ease: MOTION_EASING.emphasised,
              }}
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
