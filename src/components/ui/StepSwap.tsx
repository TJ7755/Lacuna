import { forwardRef, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

const EASE = [0.16, 1, 0.3, 1] as const;

const VARIANTS = {
  enter: (direction: number) =>
    direction === 0 ? { opacity: 0 } : { opacity: 0, x: 18 * direction },
  center: (direction: number) => (direction === 0 ? { opacity: 1 } : { opacity: 1, x: 0 }),
  exit: (direction: number) =>
    direction === 0 ? { opacity: 0 } : { opacity: 0, x: -18 * direction },
};

export function stepSwapTiming(multiplier: number) {
  return {
    duration: 0.22 * multiplier,
    ease: EASE,
  };
}

const StepSwapSurface = forwardRef<
  HTMLDivElement,
  {
    direction: number;
    motionEnabled: boolean;
    transition: ReturnType<typeof stepSwapTiming>;
    className?: string;
    children: React.ReactNode;
  }
>(function StepSwapSurface(
  { direction, motionEnabled, transition, className, children },
  ref,
) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={VARIANTS}
      initial={motionEnabled ? 'enter' : false}
      animate="center"
      exit={motionEnabled ? 'exit' : undefined}
      transition={transition}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

/**
 * Crossfades one step of a surface into the next without remounting the chrome.
 * Forward is a short slide from the right, back from the left; direction 0 fades
 * in place and must not write a transform, or `position: fixed` descendants
 * (Learn's grading sheet) would pin to this wrapper. `popLayout` keeps the
 * incoming step in flow so the panel height changes to the new content rather
 * than stacking both steps.
 */
export function StepSwap({
  stepKey,
  direction = 0,
  children,
  className,
  moveFocus = false,
}: {
  stepKey: string;
  /** 1 = forward, -1 = back, 0 = fade only. */
  direction?: number;
  children: React.ReactNode;
  className?: string;
  /** Focus the new step's heading or first control. For dialogs, not page scenes. */
  moveFocus?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const motionEnabled = multiplier > 0;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!moveFocus) return;
    const root = rootRef.current;
    if (!root) return;
    const headings = root.querySelectorAll<HTMLElement>('h1, h2');
    const target =
      headings[headings.length - 1] ??
      root.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
    target?.focus();
  }, [stepKey, moveFocus]);

  return (
    <div ref={rootRef} className="relative">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <StepSwapSurface
          key={stepKey}
          direction={direction}
          motionEnabled={motionEnabled}
          transition={stepSwapTiming(multiplier)}
          className={className}
        >
          {children}
        </StepSwapSurface>
      </AnimatePresence>
    </div>
  );
}
