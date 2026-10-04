import type { ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { MOTION_EASING } from '../ui/motion';

/** Page arrival: each section rises in on a short stagger (about 40 ms a step). */
export function Rise({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  return (
    <motion.div
      className={className}
      initial={m > 0 ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45 * m,
        delay: Math.min(index, 6) * 0.04 * m,
        ease: MOTION_EASING.emphasised,
      }}
    >
      {children}
    </motion.div>
  );
}
