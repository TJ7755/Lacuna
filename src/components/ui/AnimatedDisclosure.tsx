import { AnimatePresence, m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';

const EASE = [0.16, 1, 0.3, 1] as const;

export function animatedDisclosureTiming(multiplier: number) {
  return { duration: 0.22 * multiplier, ease: EASE };
}

/**
 * Mounts conditional content through a measured height transition. The inner wrapper preserves
 * the child's margins while the outer wrapper releases overflow after entry so focus rings are not clipped.
 */
export function AnimatedDisclosure({
  open,
  children,
  className,
  innerClassName,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const enabled = multiplier > 0;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={enabled ? { height: 0, opacity: 0 } : false}
          animate={
            enabled
              ? { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
              : undefined
          }
          exit={enabled ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
          transition={animatedDisclosureTiming(multiplier)}
          className={cn(enabled ? 'overflow-hidden' : 'overflow-visible', className)}
        >
          <div className={innerClassName}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
