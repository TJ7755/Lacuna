import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from './cn';
import { scaledSpring } from './motion';

export function animatedDisclosureTiming(multiplier: number) {
  return {
    // A height cannot overshoot below zero: CSS rejects it and freezes the closing edge.
    height: scaledSpring(multiplier, 420, 2 * Math.sqrt(420)),
    opacity: { duration: 0.12 * multiplier },
  };
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
  retainContent?: boolean;
  initial?: boolean;
  onAnimationComplete?: () => void;
}

export function AnimatedDisclosure({
  open,
  retainContent = false,
  initial = false,
  ...props
}: AnimatedDisclosureProps) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const enabled = multiplier > 0;

  if (retainContent) {
    return <RetainedDisclosure {...props} open={open} multiplier={multiplier} />;
  }

  return (
    <AnimatePresence initial={initial}>
      {open && <DisclosureContent {...props} enabled={enabled} multiplier={multiplier} />}
    </AnimatePresence>
  );
}

function RetainedDisclosure({
  open,
  multiplier,
  children,
  className,
  innerClassName,
  onAnimationComplete,
}: AnimatedDisclosureProps & { multiplier: number }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => setHeight(inner.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      inert={!open}
      aria-hidden={!open || undefined}
      initial={false}
      animate={{
        // Measuring auto height in Motion adds a measurement frame on every toggle.
        // Keep the natural height current even while the retained panel is closed.
        height: open ? (height ?? 'auto') : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transitionEnd: { overflow: open ? 'visible' : 'hidden' },
      }}
      transition={animatedDisclosureTiming(multiplier)}
      onAnimationComplete={onAnimationComplete}
      className={cn('overflow-hidden', className)}
    >
      <div ref={innerRef} className={cn('flow-root', innerClassName)}>
        {children}
      </div>
    </motion.div>
  );
}

function DisclosureContent({
  children,
  className,
  innerClassName,
  enabled,
  multiplier,
  onAnimationComplete,
}: Omit<AnimatedDisclosureProps, 'open'> & { enabled: boolean; multiplier: number }) {
  const present = useIsPresent();
  return (
    <motion.div
      inert={!present}
      aria-hidden={!present || undefined}
      initial={enabled ? { height: 0, opacity: 0 } : false}
      animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
      exit={enabled ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
      transition={animatedDisclosureTiming(multiplier)}
      onAnimationComplete={onAnimationComplete}
      className={cn(enabled ? 'overflow-hidden' : 'overflow-visible', className)}
    >
      <div className={cn('flow-root', innerClassName)}>{children}</div>
    </motion.div>
  );
}
