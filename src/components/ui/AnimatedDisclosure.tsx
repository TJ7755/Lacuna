import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { expandingActionSpring } from './motion';

export function animatedDisclosureTiming(multiplier: number) {
  return { height: expandingActionSpring(multiplier), opacity: { duration: 0.12 * multiplier } };
}

/**
 * Mounts conditional content through a measured height transition. The inner wrapper preserves
 * the child's margins while the outer wrapper releases overflow after entry so focus rings are not clipped.
 */
interface AnimatedDisclosureProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export function AnimatedDisclosure({ open, ...props }: AnimatedDisclosureProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const enabled = multiplier > 0;

  return (
    <AnimatePresence initial={false}>
      {open && <DisclosureContent {...props} enabled={enabled} multiplier={multiplier} />}
    </AnimatePresence>
  );
}

function DisclosureContent({
  children,
  className,
  innerClassName,
  enabled,
  multiplier,
}: Omit<AnimatedDisclosureProps, 'open'> & { enabled: boolean; multiplier: number }) {
  const present = useIsPresent();
  return (
    <motion.div
      inert={!present}
      aria-hidden={!present || undefined}
      initial={enabled ? { height: 0, opacity: 0 } : false}
      animate={
        enabled ? { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } } : undefined
      }
      exit={enabled ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
      transition={animatedDisclosureTiming(multiplier)}
      className={cn(enabled ? 'overflow-hidden' : 'overflow-visible', className)}
    >
      <div className={innerClassName}>{children}</div>
    </motion.div>
  );
}
