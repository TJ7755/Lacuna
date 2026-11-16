import { AppLink as Link } from '../ui/AppLink';
import type { summariseSelfMarking } from '@lacuna/core/questions/questionSets';
import { m as motion } from 'motion/react';
import { Button, buttonClassName } from '../ui/Button';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';

/** Progression never supplies a mark: the learner must award the active criterion. */
export function QuestionSetMarkingActions({
  summary,
  awardedAny,
  action,
  onAdvance,
  onComplete,
  returnTo,
  returnLabel,
}: {
  summary: ReturnType<typeof summariseSelfMarking>;
  awardedAny: boolean;
  action: {
    complete: boolean;
    label: string;
    disabled: boolean;
    showFinish: boolean;
    finishDisabled: boolean;
  };
  onAdvance: () => void;
  onComplete: () => void;
  returnTo: string;
  returnLabel: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const remaining = summary.unmarkedCount + summary.unsureCount;
  const awarded = awardedAny ? String(summary.total.awarded) : '—';
  return (
    <div className="qs-marking-actions">
      <div>
        <p className="qs-result" title="Self-marked">
          {/* The awarded total rises into place so a changed mark visibly lands in the score. */}
          <motion.strong
            key={awarded}
            initial={multiplier > 0 ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={scaledSpring(multiplier, 420, 32)}
          >
            {awarded}
          </motion.strong>{' '}
          <span className="qs-result-total">/ {summary.total.available}</span>
          <span className="sr-only">
            {' '}
            self-marked
            {summary.status === 'provisional' &&
              `, provisional, ${remaining} ${remaining === 1 ? 'criterion' : 'criteria'} remaining`}
          </span>
        </p>
      </div>
      {action.complete ? (
        <Link className={buttonClassName('primary')} data-attempt-complete to={returnTo}>
          {returnLabel}
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <div className="qs-primary-actions">
          <Button
            variant="primary"
            data-attempt-primary
            disabled={action.disabled}
            onClick={onAdvance}
          >
            {action.label}
          </Button>
          {action.showFinish && (
            <Button variant="secondary" disabled={action.finishDisabled} onClick={onComplete}>
              Finish attempt
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
