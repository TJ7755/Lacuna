import { AppLink as Link } from '../ui/AppLink';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { summariseSelfMarking } from '../../questions/questionSets';
import { Button } from '../ui/Button';

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
  const summary = summariseSelfMarking(attempt.receipt, attempt.decisions);
  const remaining = summary.unmarkedCount + summary.unsureCount;
  const continuing = Boolean(nextCriterion && criterionCount > 1);
  const label = continuing
    ? criterionIndex < criterionCount - 1
      ? 'Continue marking'
      : 'Review remaining criteria'
    : attempt.status === 'answering'
      ? 'Next question'
      : 'Finish attempt';
  return (
    <>
      <div>
        <p className="qs-result">
          {attempt.decisions.some((row) => row.status === 'awarded') ? summary.total.awarded : '—'}{' '}
          / {summary.total.available}{' '}
          <span>self-marked{summary.status === 'provisional' ? ' · provisional' : ''}</span>
        </p>
        {summary.status === 'provisional' && (
          <p className="qs-muted">
            {remaining} {remaining === 1 ? 'criterion' : 'criteria'} remaining
          </p>
        )}
      </div>
      {attempt.status === 'complete' ? (
        <Link className="qs-back" data-attempt-complete to={returnTo}>
          {returnLabel} →
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
          <p className="qs-muted">Ctrl/Cmd+Enter · {label}</p>
        </div>
      )}
    </>
  );
}
