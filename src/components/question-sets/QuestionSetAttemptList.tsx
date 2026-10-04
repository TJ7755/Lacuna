import { Link } from 'react-router-dom';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { summariseSelfMarking } from '../../questions/questionSets';
import type { questionSetReturn } from '../../questions/questionSetNavigation';

export function QuestionSetAttemptList({
  attempts,
  origin,
  showTitles = false,
}: {
  attempts: QuestionSetAttemptRecord[];
  origin?: ReturnType<typeof questionSetReturn>;
  showTitles?: boolean;
}) {
  return (
    <div className="qs-set-list">
      {attempts.map((attempt) => {
        const result = summariseSelfMarking(attempt.receipt, attempt.decisions);
        return (
          <Link
            className="qs-set-row"
            key={attempt.id}
            state={origin}
            to={`/course/${attempt.courseId}/question-sets/${attempt.questionSetId}/attempts/${attempt.id}`}
          >
            <div>
              {showTitles && <h2>{attempt.receipt.title}</h2>}
              <p>
                {attempt.mode === 'paper' ? 'Paper' : 'Practice'} ·{' '}
                {new Date(attempt.createdAt).toLocaleDateString('en-GB')}
              </p>
              <p>
                {attempt.status === 'complete'
                  ? `${result.total.awarded} / ${result.total.available} · self-marked`
                  : attempt.status === 'marking'
                    ? 'Ready to mark'
                    : 'In progress'}
              </p>
            </div>
            <span>{attempt.status === 'complete' ? 'Review' : 'Continue'} →</span>
          </Link>
        );
      })}
    </div>
  );
}
