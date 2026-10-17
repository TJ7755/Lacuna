import { useId, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

/** Retains nested settings drafts without retaining their closed interaction targets. */
export function InlineSettingsDisclosure({
  header,
  children,
  className,
  headerClassName,
  label,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <div className={className}>
      <button
        type="button"
        data-press
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`w-full scale-100! text-left ${headerClassName}`}
      >
        {header}
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionTransition('feedback', multiplier)}
          className="mt-0.5 shrink-0 text-ink-faint"
        >
          <ChevronDownIcon width={18} height={18} />
        </motion.span>
      </button>
      <div id={id}>
        <AnimatedDisclosure open={open} retainContent>
          {children}
        </AnimatedDisclosure>
      </div>
    </div>
  );
}
