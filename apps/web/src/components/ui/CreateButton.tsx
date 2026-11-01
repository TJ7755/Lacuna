import { forwardRef, type ComponentProps } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring } from './motion';
import { cn } from './cn';

export const createButtonClassName =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-raised px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-line-strong active:bg-ink/5 disabled:opacity-40';

export const CreateButton = forwardRef<HTMLButtonElement, ComponentProps<typeof motion.button>>(
  function CreateButton({ className, ...props }, ref) {
    const [speed] = useMotionSpeed();
    const multiplier = speedMultiplier(speed);
    return (
      <motion.button
        ref={ref}
        type="button"
        data-press=""
        whileTap={multiplier > 0 ? { scale: 0.97 } : undefined}
        transition={expandingActionSpring(multiplier)}
        className={cn(createButtonClassName, className)}
        {...props}
      />
    );
  },
);
