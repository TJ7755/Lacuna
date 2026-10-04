import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { MOTION_EASING } from '../ui/motion';
import { CheckIcon } from '../ui/icons';

export type ImportStep = 'input' | 'review';

/**
 * The two-step progress header. The connector fills as the flow moves to review and
 * the completed step swaps its number for a tick that pops in.
 */
export function ImportStepper({ step }: { step: ImportStep }) {
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const review = step === 'review';
  return (
    <ol className="card-import-steps" aria-label="Import progress">
      <li aria-current={!review ? 'step' : undefined} data-done={review}>
        <span className="card-import-step-mark">
          {review ? (
            <motion.span
              key="tick"
              className="card-import-tick"
              initial={m ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              transition={m ? { type: 'spring', stiffness: 520 / m ** 2, damping: 18 / m } : { duration: 0 }}
            >
              <CheckIcon width={14} height={14} />
            </motion.span>
          ) : (
            <b>1</b>
          )}
        </span>
        Add content
      </li>
      <li className="card-import-connector" aria-hidden="true">
        <motion.span
          initial={false}
          animate={{ scaleX: review ? 1 : 0 }}
          transition={{ duration: 0.4 * m, ease: MOTION_EASING.standard }}
        />
      </li>
      <li aria-current={review ? 'step' : undefined}>
        <span className="card-import-step-mark" data-active={review}>
          <b>2</b>
        </span>
        Review cards
      </li>
    </ol>
  );
}
