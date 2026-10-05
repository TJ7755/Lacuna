import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Button } from '../ui/Button';
import { CheckIcon } from '../ui/icons';

/** A Copy button that confirms with a tick that pops in, then returns to "Copy". */
export function CopyButton({
  copied,
  onClick,
  size = 'sm',
  label = 'Copy',
}: {
  copied: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  return (
    <Button size={size} variant={copied ? 'primary' : 'secondary'} onClick={onClick}>
      {copied ? (
        <>
          <motion.span
            className="grid place-items-center"
            initial={m ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={
              m ? { type: 'spring', stiffness: 520 / m ** 2, damping: 16 / m } : { duration: 0 }
            }
          >
            <CheckIcon width={14} height={14} />
          </motion.span>
          Copied
        </>
      ) : (
        label
      )}
    </Button>
  );
}
