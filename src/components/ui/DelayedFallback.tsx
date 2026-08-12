import type { ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { useDelayedPending } from '../../hooks/useDelayedPending';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

/**
 * Withholds a loading placeholder until loading has lasted long enough to be worth
 * acknowledging, then fades it in rather than snapping it on.
 *
 * Mounting this component *is* the loading signal: a placeholder is only ever
 * rendered while its data is pending, so the wrapper needs no condition of its own
 * and callers keep their existing loading branch unchanged.
 */
export function DelayedFallback({ children }: { children: ReactNode }) {
  const visible = useDelayedPending(true);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  if (!visible) return null;

  return (
    <motion.div
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 * m }}
    >
      {children}
    </motion.div>
  );
}
