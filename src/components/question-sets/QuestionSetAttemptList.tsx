import { AppLink as Link } from '../ui/AppLink';
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
    <ol className="m-0 list-none p-0">
      {attempts.map((attempt) => {
        const result = summariseSelfMarking(attempt.receipt, attempt.decisions);
        const date = new Date(attempt.createdAt);
        return (
          <li key={attempt.id}>
            <Link
              className="-mx-2 flex min-h-11 min-w-0 items-center gap-3.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/10"
              state={origin}
              to={`/course/${attempt.courseId}/question-sets/${attempt.questionSetId}/attempts/${attempt.id}`}
            >
              <time
                dateTime={date.toISOString()}
                aria-label={date.toLocaleDateString('en-GB')}
                className="w-11 shrink-0 text-center leading-tight"
              >
                <span className="block font-display text-[22px] font-semibold tracking-tight tabular-nums">
                  {date.getDate()}
                </span>
                <span className="text-xs text-ink-faint">
                  {date.toLocaleDateString('en-GB', { month: 'short' })}
                </span>
              </time>
              <span className="min-w-0 flex-1">
                {showTitles && (
                  <strong className="block truncate font-bold">{attempt.receipt.title}</strong>
                )}
                <span className={showTitles ? 'text-sm text-ink-faint' : 'font-bold'}>
                  {attempt.mode === 'paper' ? 'Paper' : 'Practice'}
                </span>
              </span>
              <span className="shrink-0 text-sm text-ink-faint tabular-nums">
                {attempt.status === 'complete'
                  ? `${result.total.awarded} / ${result.total.available}`
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
