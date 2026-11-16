import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { MarkdownView } from '../markdown/MarkdownView';
import { countOf } from '../../utils/plural';
import { formatRelativeTime } from '../../utils/datetime';

/** Original receipts stay separate: a historical grade is not a criterion-level marking. */
export function IndividualQuestionHistory({ courseId }: { courseId: string }) {
  const history = useLiveQuery(async () => {
    const [questions, attempts] = await Promise.all([
      db.questions.where('courseId').equals(courseId).toArray(),
      db.questionAttempts.where('courseId').equals(courseId).toArray(),
    ]);
    const byId = new Map(questions.map((question) => [question.id, question]));
    return [...new Set([...byId.keys(), ...attempts.map((row) => row.questionId)])].map((id) => ({
      id,
      question: byId.get(id),
      attempts: attempts
        .filter((row) => row.questionId === id)
        .sort((a, b) => b.shownAt - a.shownAt || a.id.localeCompare(b.id)),
    }));
  }, [courseId]);
  if (!history?.length) return null;
  return (
    <details className="mt-8">
      <summary>Earlier question history</summary>
      <div className="mt-6 space-y-6">
        {history.map(({ id, question, attempts }) => (
          <details key={id}>
            <summary>{question?.name ?? 'Removed question'}</summary>
            {question && (
              <p className="mt-4 text-ink-soft">
                {countOf(question.reps, 'previous review')}.{' '}
                {question.suspended
                  ? 'Suspended.'
                  : question.due === null
                    ? 'Not scheduled.'
                    : `Previously due ${formatRelativeTime(question.due)}.`}
              </p>
            )}
            {question?.kind === 'generated' && (
              <p className="text-ink-soft">
                {question.generatorKey}, version {question.generatorVersion}
              </p>
            )}
            <ol className="mt-4 space-y-6">
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <p className="text-ink-soft">
                    {formatRelativeTime(attempt.shownAt)} ·{' '}
                    {attempt.undoneAt !== undefined ? 'Undone' : attempt.status}
                    {attempt.marksEarned !== undefined && attempt.marksAvailable !== undefined
                      ? ` · ${attempt.marksEarned}/${attempt.marksAvailable}`
                      : ''}
                  </p>
                  <MarkdownView source={attempt.renderedPrompt} />
                  {attempt.historicalPresentationKnown === false && (
                    <p>Original presentation was not recorded.</p>
                  )}
                  {attempt.submittedAnswer === undefined ? (
                    <p>Answer was not recorded.</p>
                  ) : (
                    <MarkdownView
                      source={
                        Array.isArray(attempt.submittedAnswer)
                          ? attempt.submittedAnswer.join('\n\n')
                          : attempt.submittedAnswer
                      }
                    />
                  )}
                  <details className="mt-3">
                    <summary>Feedback</summary>
                    <MarkdownView source={attempt.renderedExplanation} />
                    {attempt.correction && (
                      <MarkdownView
                        source={
                          Array.isArray(attempt.correction.submittedAnswer)
                            ? attempt.correction.submittedAnswer.join('\n\n')
                            : attempt.correction.submittedAnswer
                        }
                      />
                    )}
                  </details>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </details>
  );
}
