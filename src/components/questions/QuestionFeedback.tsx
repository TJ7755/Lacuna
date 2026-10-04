import { useMemo, useState } from 'react';
import type { QuestionAttempt } from '../../questions/types';
import { checkQuestionAnswer } from './QuestionResponsePanel';
import { MarkdownView } from '../markdown/MarkdownView';
import { MathsAnswerInput } from '../items/MathsAnswerInput';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { Button } from '../ui/Button';
import { ChevronDownIcon, ChevronRightIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { ResultMark, resultTone } from './ResultMark';

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
  const [solutionOpen, setSolutionOpen] = useState(true);
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
  const marksEarned = attempt.marksEarned ?? 0;
  const marksAvailable = attempt.marksAvailable ?? 0;
  const fullMarks = marksEarned === marksAvailable;
  const tone = resultTone(marksEarned, marksAvailable, scheduleWithheld);

  return (
    <section className="rounded-[28px] bg-surface px-6 py-8 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:px-[52px] md:py-11">
      <div className="flex items-center gap-4">
        <ResultMark tone={tone} className="size-11" />
        <p className="flex-1 font-display text-2xl font-semibold tracking-tight text-ink">
          {scheduleWithheld
            ? 'Checker review needed'
            : fullMarks
              ? 'Full marks'
              : 'Try this again sooner'}
        </p>
        <p className="text-lg tabular-nums text-ink-soft">
          {attempt.marksEarned} / {attempt.marksAvailable} marks
        </p>
      </div>

      <div className="mt-6">
        <button
          type="button"
          aria-expanded={solutionOpen}
          onClick={() => setSolutionOpen((open) => !open)}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            solutionOpen
              ? 'border-ink bg-ink text-paper'
              : 'border-line-strong bg-surface text-ink hover:border-ink/40',
          )}
        >
          Worked solution
          <ChevronDownIcon
            width={16}
            height={16}
            className={cn('transition-transform duration-300', solutionOpen && 'rotate-180')}
          />
        </button>
        <AnimatedDisclosure open={solutionOpen}>
          <div className="pt-4 text-base leading-7 text-ink">
            <MarkdownView source={attempt.renderedExplanation} />
          </div>
        </AnimatedDisclosure>
      </div>

      {scheduleWithheld && (
        <p className="mt-6 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm leading-6 text-ink-soft">
          The attempt and raw marks have been retained. It has not changed this Question’s
          schedule because the checker abstained or you disputed its verdict.
        </p>
      )}

      {!attempt.correction && !correcting && (
        <button
          type="button"
          onClick={() => setCorrecting(true)}
          className="mt-6 inline-flex min-h-11 items-center text-sm text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          Record an optional correction
        </button>
      )}
      {correcting && !attempt.correction && (
        <div className="mt-6 rounded-[18px] bg-ink/[0.04] p-4">
          <p className="mb-4 text-sm leading-6 text-ink-soft">
            Work the problem again. This is stored separately and never rewrites your first
            submission.
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
              className="w-full rounded-[14px] border-[1.5px] border-line-strong bg-surface px-4 py-3.5 font-mono text-base leading-7 text-ink outline-none transition focus:border-ink"
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
        <p className="mt-6 rounded-2xl bg-positive/10 px-4 py-3 text-sm text-ink-soft">
          Correction recorded:{' '}
          <span className="font-semibold tabular-nums text-ink">
            {attempt.correction.marksEarned} / {attempt.correction.marksAvailable}
          </span>{' '}
          marks.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onUndo}
          disabled={busy || attempt.undoneAt !== undefined}
        >
          {attempt.undoneAt !== undefined ? 'Scheduling undone' : 'Undo scheduling'}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="min-h-14 px-7 font-bold"
          onClick={onNext}
          disabled={busy}
        >
          Next Question
          <ChevronRightIcon width={16} height={16} />
        </Button>
      </div>
    </section>
  );
}
