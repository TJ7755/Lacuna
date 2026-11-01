import { AppLink as Link } from '../ui/AppLink';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { summariseSelfMarking } from '../../questions/questionSets';
import { m as motion } from 'motion/react';
import { Button, buttonClassName } from '../ui/Button';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { scaledSpring } from '../ui/motion';

/** Progression never supplies a mark: the learner must award the active criterion. */
export function QuestionSetMarkingActions({
  attempt,
  blocked,
  currentMarked,
  nextCriterion,
  criterionIndex,
  criterionCount,
  onMove,
  onNextQuestion,
  onComplete,
  returnTo,
  returnLabel,
}: {
  attempt: QuestionSetAttemptRecord;
  blocked: boolean;
  currentMarked: boolean;
  nextCriterion?: { nodeId: string; allocation: { id: string } };
  criterionIndex: number;
  criterionCount: number;
  onMove: (nodeId: string, allocationId: string) => void;
  onNextQuestion: () => void;
  onComplete: () => void;
  returnTo: string;
  returnLabel: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const summary = summariseSelfMarking(attempt.receipt, attempt.decisions);
  const remaining = summary.unmarkedCount + summary.unsureCount;
  const continuing = Boolean(nextCriterion && criterionCount > 1);
  const label = continuing
    ? criterionIndex < criterionCount - 1
      ? 'Next'
      : 'Next unmarked'
    : attempt.status === 'answering'
      ? 'Next question'
      : 'Finish attempt';
  const awarded = attempt.decisions.some((row) => row.status === 'awarded')
    ? String(summary.total.awarded)
    : '—';
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
      {attempt.status === 'complete' ? (
        <Link className={buttonClassName('primary')} data-attempt-complete to={returnTo}>
          {returnLabel}
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <div className="qs-primary-actions">
          <Button
            variant="primary"
            data-attempt-primary
            disabled={
              blocked ||
              !currentMarked ||
              (!continuing && attempt.status !== 'answering' && summary.status !== 'complete')
            }
            onClick={() =>
              continuing && nextCriterion
                ? onMove(nextCriterion.nodeId, nextCriterion.allocation.id)
                : attempt.status === 'answering'
                  ? onNextQuestion()
                  : onComplete()
            }
          >
            {label}
          </Button>
          {continuing && attempt.status === 'marking' && (
            <Button
              variant="secondary"
              disabled={blocked || summary.status !== 'complete'}
              onClick={onComplete}
            >
              Finish attempt
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
