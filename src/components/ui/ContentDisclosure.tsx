import { useId, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { AnimatedDisclosure } from './AnimatedDisclosure';
import { Button } from './Button';
import { ChevronDownIcon } from './icons';
import { motionTransition } from './motion';

/** An on-demand view of supporting content, retained while closed but inert. */
export function ContentDisclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        hoverScale={false}
        pressScale={false}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {label}
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionTransition('feedback', multiplier)}
        >
          <ChevronDownIcon width={16} height={16} />
        </motion.span>
      </Button>
      <div id={id}>
        <AnimatedDisclosure open={open} retainContent>
          {children}
        </AnimatedDisclosure>
      </div>
    </div>
  );
}
