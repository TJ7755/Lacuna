import { useMemo, useState } from 'react';
import { checkNumeric, parseExpression, verifyWorkingLines } from '../../items/verify';
import type { CheckerDisputeReport, LineVerdict } from '../../db/types';
import { highlightParameters } from '../../questions/bankSummary';
import type { QuestionAttempt, QuestionPayload } from '../../questions/types';
import { MarkdownView } from '../markdown/MarkdownView';
import { MathsAnswerInput } from '../items/MathsAnswerInput';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { ResultMark, resultTone } from './ResultMark';

export interface CheckedQuestionAnswer {
  submittedAnswer: string | string[];
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
  responseTimeSeconds: number;
}

interface CheckedDraft {
  answer: string | string[];
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
}

export function QuestionResponsePanel({
  attempt,
  onSubmit,
  onReroll,
}: {
  attempt: QuestionAttempt;
  onSubmit: (answer: CheckedQuestionAnswer) => void;
  /** Present only for generated families: swap this presentation for fresh numbers. */
  onReroll?: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<CheckedDraft | null>(null);
  const [disputedLines, setDisputedLines] = useState<Set<number>>(new Set());
  const startedAt = useState(() => performance.now())[0];
  const parsed = useMemo(() => (answer.trim() ? parseExpression(answer) : null), [answer]);
  const studentLines = useMemo(() => answerLines(answer), [answer]);
  const prompt = useMemo(
    () => highlightParameters(attempt.renderedPrompt, attempt.parameters),
    [attempt.parameters, attempt.renderedPrompt],
  );

  const check = () => {
    const result = checkQuestionAnswer(attempt.resolvedPayload, answer, attempt.id);
    if (result) setChecked(result);
  };

  const submit = () => {
    if (!checked) return;
    const checkerDisputes = [...disputedLines].map((index): CheckerDisputeReport => {
      const verdict = checked.lineVerdicts?.[index];
      return {
        reportedAt: Date.now(),
        question: attempt.renderedPrompt,
        studentLine: verdict?.studentLine ?? String(checked.answer),
        verdict: {
          correct: verdict ? verdict.matchedLineIndex !== null : checked.marksEarned > 0,
          marksEarned: verdict?.marksEarned ?? checked.marksEarned,
          ...(verdict ? { matchedLineIndex: verdict.matchedLineIndex } : {}),
          ...(verdict?.undetermined ? { undetermined: true as const } : {}),
        },
        checkerSeeds: verdict?.checkerSeeds ?? [],
      };
    });
    onSubmit({
      submittedAnswer: checked.answer,
      marksEarned: checked.marksEarned,
      marksAvailable: checked.marksAvailable,
      lineVerdicts: checked.lineVerdicts,
      checkerDisputes: checkerDisputes.length ? checkerDisputes : undefined,
      responseTimeSeconds: Math.max(0, (performance.now() - startedAt) / 1000),
    });
  };

  const numeric = attempt.resolvedPayload.kind === 'numeric';
  const canCheck = numeric ? Boolean(parsed?.ok) : studentLines.length > 0;

  return (
    <section className="flex flex-col gap-6 rounded-[28px] bg-surface px-6 py-8 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:px-[52px] md:py-11">
      {onReroll && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onReroll} className="border border-line-strong">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5" />
              <path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
            </svg>
            New numbers
          </Button>
        </div>
      )}
      <div className="max-w-[24em] font-display text-2xl font-semibold leading-snug tracking-tight text-ink md:text-[32px] [&_p]:my-0 [&_strong]:font-semibold [&_strong]:text-accent-ink">
        <MarkdownView source={prompt} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (checked) submit();
          else check();
        }}
      >
        <StepSwap stepKey={checked ? 'result' : 'answer'} direction={checked ? 1 : -1}>
          {checked ? (
            <>
              <CheckedResult
                result={checked}
                disputedLines={disputedLines}
                onToggleDispute={(line) =>
                  setDisputedLines((current) => {
                    const next = new Set(current);
                    if (next.has(line)) next.delete(line);
                    else next.add(line);
                    return next;
                  })
                }
              />
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setChecked(null);
                    setDisputedLines(new Set());
                  }}
                >
                  Edit answer
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="min-h-14 px-7 font-bold"
                >
                  Show worked feedback
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {!numeric && (
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={6}
                  aria-label="Your working"
                  placeholder="Write one step per line"
                  autoFocus
                  className="w-full resize-y rounded-[14px] border-[1.5px] border-line-strong bg-surface px-4 py-3.5 font-mono text-base leading-7 text-ink outline-none transition focus:border-ink"
                />
              )}
              <div className="flex flex-wrap items-start gap-3">
                {numeric && (
                  <MathsAnswerInput
                    value={answer}
                    onChange={setAnswer}
                    label="Your answer"
                    placeholder="Enter your answer"
                    autoFocus
                    className="min-w-[14rem] flex-1"
                  />
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  aria-label={numeric ? 'Check answer' : 'Check working'}
                  className={`min-h-14 px-7 font-bold ${numeric ? 'mt-6' : 'ml-auto'}`}
                  disabled={!canCheck}
                >
                  Check
                </Button>
              </div>
            </div>
          )}
        </StepSwap>
      </form>
    </section>
  );
}

function CheckedResult({
  result,
  disputedLines,
  onToggleDispute,
}: {
  result: CheckedDraft;
  disputedLines: Set<number>;
  onToggleDispute: (line: number) => void;
}) {
  const rows: LineVerdict[] = result.lineVerdicts ?? [
    {
      studentLine: String(result.answer),
      matchedLineIndex: result.marksEarned ? 0 : null,
      marksEarned: result.marksEarned,
    } as LineVerdict,
  ];
  const undetermined = rows.some((row) => row.undetermined);
  const tone = resultTone(result.marksEarned, result.marksAvailable, undetermined);
  const title =
    tone === 'right'
      ? 'Right'
      : tone === 'partial'
        ? 'Partly right'
        : tone === 'undetermined'
          ? 'Not sure'
          : 'Not quite';
  return (
    <div
      aria-label="Checker result"
      className="flex flex-col gap-4 rounded-[18px] bg-ink/[0.04] px-5 py-[18px]"
    >
      <div role="status" className="flex items-center gap-3.5">
        <ResultMark tone={tone} />
        <p className="flex-1 font-bold text-ink">{title}</p>
        <p className="text-sm tabular-nums text-ink-soft">
          {result.marksEarned} / {result.marksAvailable} marks
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((verdict, index) => {
          const disputed = disputedLines.has(index);
          return (
            <li
              key={`${index}-${verdict.studentLine}`}
              className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3"
            >
              <span
                className={`min-w-4 pt-0.5 font-semibold tabular-nums ${
                  verdict.undetermined
                    ? 'text-ink-faint'
                    : verdict.matchedLineIndex === null
                      ? 'text-negative'
                      : 'text-positive'
                }`}
              >
                {verdict.undetermined ? '–' : verdict.marksEarned}
              </span>
              <span className="min-w-0 flex-1 break-words pt-0.5 font-mono text-sm leading-6 text-ink">
                {verdict.studentLine}
                {verdict.undetermined && (
                  <span className="mt-1 block font-sans text-xs text-ink-faint">
                    The checker could not decide this line. Scheduling will be withheld.
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-pressed={disputed}
                aria-label={
                  rows.length > 1 ? `Marked unfairly? ${verdict.studentLine}` : undefined
                }
                onClick={() => onToggleDispute(index)}
                className="inline-flex min-h-11 shrink-0 items-center text-sm text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                {disputed ? 'Reported' : 'Marked unfairly?'}
              </button>
            </li>
          );
        })}
      </ul>
      {disputedLines.size > 0 && (
        <p className="text-sm leading-5 text-ink-soft">
          The Question schedule will not change while the checker result is disputed.
        </p>
      )}
    </div>
  );
}

export function checkQuestionAnswer(
  payload: QuestionPayload,
  rawAnswer: string,
  checkerSeed: string,
): CheckedDraft | null {
  if (payload.kind === 'numeric') {
    const parsed = parseExpression(rawAnswer);
    if (!parsed.ok) return null;
    const correct = checkNumeric(parsed.expression, payload.answer);
    return {
      answer: rawAnswer.trim(),
      marksEarned: correct ? 1 : 0,
      marksAvailable: 1,
    };
  }
  const lines = answerLines(rawAnswer);
  if (!lines.length) return null;
  const result = verifyWorkingLines(lines, payload.scheme, checkerSeed);
  return { answer: lines, ...result };
}

function answerLines(answer: string): string[] {
  return answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
