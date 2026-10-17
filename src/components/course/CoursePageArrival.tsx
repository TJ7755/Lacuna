import type { ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { motionTransition } from '../ui/motion';

/** Mount only when the workspace is ready, so its entrance belongs to content, not loading. */
export function CoursePageArrival({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <motion.div
      data-course-page-arrival=""
      className={className}
      initial={multiplier > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={motionTransition('local', multiplier)}
    >
      {children}
    </motion.div>
  );
}
