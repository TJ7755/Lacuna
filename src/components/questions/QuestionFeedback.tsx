import { useMemo, useState } from 'react';
import type { QuestionAttempt } from '../../questions/types';
import { checkQuestionAnswer } from './QuestionResponsePanel';
import { MarkdownView } from '../markdown/MarkdownView';
import { MathsAnswerInput } from '../items/MathsAnswerInput';
import { Button } from '../ui/Button';

export function QuestionFeedback({
  attempt,
  onCorrection,
  onNext,
  onUndo,
  busy = false,
}: {
  attempt: QuestionAttempt;
  onCorrection: (answer: {
    submittedAnswer: string | string[];
    marksEarned: number;
    marksAvailable: number;
    lineVerdicts?: QuestionAttempt['lineVerdicts'];
  }) => void;
  onNext: () => void;
  onUndo: () => void;
  busy?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [answer, setAnswer] = useState('');
  const correctionResult = useMemo(
    () =>
      correcting
        ? checkQuestionAnswer(attempt.resolvedPayload, answer, `${attempt.id}:correction`)
        : null,
    [answer, attempt.id, attempt.resolvedPayload, correcting],
  );
  const scheduleWithheld =
    (attempt.checkerDisputes?.length ?? 0) > 0 ||
    (attempt.lineVerdicts?.some((line) => line.undetermined) ?? false);
  const fullMarks = attempt.marksEarned === attempt.marksAvailable;

  return (
    <section className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-xl shadow-black/5 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">First submission</p>
            <p className="mt-1 font-display text-2xl text-ink">
              {scheduleWithheld
                ? 'Checker review needed'
                : fullMarks
                  ? 'Full marks'
                  : 'Try this again sooner'}
            </p>
          </div>
          <p className="font-mono text-lg tabular-nums text-ink">
            {attempt.marksEarned} / {attempt.marksAvailable} marks
          </p>
        </div>

        <div className="py-7">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-ink-faint">Worked feedback</p>
          <div className="text-base leading-7 text-ink">
            <MarkdownView source={attempt.renderedExplanation} />
          </div>
        </div>

        {scheduleWithheld && (
          <p className="mb-6 rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-ink-soft">
            The attempt and raw marks have been retained. It has not changed this Question’s
            schedule because the checker abstained or you disputed its verdict.
          </p>
        )}

        {!attempt.correction && !correcting && (
          <button
            type="button"
            onClick={() => setCorrecting(true)}
            className="mb-6 text-sm text-accent underline decoration-accent/30 underline-offset-4"
          >
            Record an optional correction
          </button>
        )}
        {correcting && !attempt.correction && (
          <div className="mb-7 rounded-2xl border border-line bg-surface-raised p-4">
            <p className="mb-4 text-sm leading-6 text-ink-soft">
              Work the problem again after reading the explanation. This correction is stored
              separately and never rewrites your first submission.
            </p>
            {attempt.resolvedPayload.kind === 'numeric' ? (
              <MathsAnswerInput value={answer} onChange={setAnswer} label="Corrected answer" />
            ) : (
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={6}
                aria-label="Corrected working"
                placeholder="Write one step per line"
                className="w-full rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-base leading-7 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCorrecting(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!correctionResult || busy}
                onClick={() =>
                  correctionResult &&
                  onCorrection({
                    submittedAnswer: correctionResult.answer,
                    marksEarned: correctionResult.marksEarned,
                    marksAvailable: correctionResult.marksAvailable,
                    lineVerdicts: correctionResult.lineVerdicts,
                  })
                }
              >
                Record correction
              </Button>
            </div>
          </div>
        )}
        {attempt.correction && (
          <div className="mb-7 rounded-xl border border-positive/25 bg-positive/5 px-4 py-3 text-sm text-ink-soft">
            Correction recorded:{' '}
            <span className="font-mono text-ink">
              {attempt.correction.marksEarned} / {attempt.correction.marksAvailable}
            </span>{' '}
            marks.
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={onUndo}
            disabled={busy || attempt.undoneAt !== undefined}
          >
            {attempt.undoneAt !== undefined ? 'Scheduling undone' : 'Undo scheduling'}
          </Button>
          <Button type="button" variant="primary" onClick={onNext} disabled={busy}>
            Next Question
          </Button>
        </div>
      </div>
    </section>
  );
}
