import { AppLink as Link } from '../ui/AppLink';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { summariseSelfMarking } from '@lacuna/core/questions/questionSets';
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
    <ol className="m-0 list-none divide-y divide-line p-0">
      {attempts.map((attempt) => {
        const result = summariseSelfMarking(attempt.receipt, attempt.decisions);
        const date = new Date(attempt.createdAt);
        return (
          <li key={attempt.id}>
            <Link
              className="-mx-2 flex min-h-11 min-w-0 items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/10"
              state={origin}
              to={`/course/${attempt.courseId}/question-sets/${attempt.questionSetId}/attempts/${attempt.id}`}
            >
              <span className="min-w-0 flex-1">
                {showTitles && (
                  <strong className="block truncate font-bold">{attempt.receipt.title}</strong>
                )}
                <time
                  dateTime={date.toISOString()}
                  className="block text-sm font-medium tabular-nums"
                >
                  {date.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
                <span className="text-xs text-ink-faint">
                  {attempt.mode === 'paper' ? 'Paper' : 'Practice'}
                </span>
              </span>
              <span className="shrink-0 text-sm text-ink-faint tabular-nums">
                {attempt.status === 'complete'
                  ? `${result.total.awarded} / ${result.total.available} ${result.total.available === 1 ? 'mark' : 'marks'}`
                  : attempt.status === 'marking'
                    ? 'Ready to mark'
                    : 'In progress'}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
