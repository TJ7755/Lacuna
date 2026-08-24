import { useMemo, useState } from 'react';
import { checkNumeric, parseExpression, verifyWorkingLines } from '../../items/verify';
import type { CheckerDisputeReport, LineVerdict } from '../../db/types';
import type { QuestionAttempt, QuestionPayload } from '../../questions/types';
import { MarkdownView } from '../markdown/MarkdownView';
import { MathsAnswerInput } from '../items/MathsAnswerInput';
import { Button } from '../ui/Button';

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
}: {
  attempt: QuestionAttempt;
  onSubmit: (answer: CheckedQuestionAnswer) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<CheckedDraft | null>(null);
  const [disputedLines, setDisputedLines] = useState<Set<number>>(new Set());
  const startedAt = useState(() => performance.now())[0];
  const parsed = useMemo(() => (answer.trim() ? parseExpression(answer) : null), [answer]);
  const studentLines = useMemo(() => answerLines(answer), [answer]);

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

  return (
    <section className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-xl shadow-black/5 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl text-center text-lg leading-relaxed text-ink md:text-xl">
        <MarkdownView source={attempt.renderedPrompt} />
      </div>
      <form
        className="mx-auto mt-9 max-w-2xl border-t border-line pt-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (checked) submit();
          else check();
        }}
      >
        {checked ? (
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
        ) : attempt.resolvedPayload.kind === 'numeric' ? (
          <MathsAnswerInput
            value={answer}
            onChange={setAnswer}
            label="Your answer"
            placeholder="Enter your answer"
            autoFocus
          />
        ) : (
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Your working
            </span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={8}
              placeholder="Write one step per line"
              autoFocus
              className="w-full resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-base leading-7 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          disabled={
            !checked &&
            (attempt.resolvedPayload.kind === 'numeric' ? !parsed?.ok : studentLines.length === 0)
          }
        >
          {checked
            ? 'Show worked feedback'
            : attempt.resolvedPayload.kind === 'numeric'
              ? 'Check answer'
              : 'Check working'}
        </Button>
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
  const rows = result.lineVerdicts ?? [
    {
      studentLine: String(result.answer),
      matchedLineIndex: result.marksEarned ? 0 : null,
      marksEarned: result.marksEarned,
    },
  ];
  return (
    <div aria-label="Checker result">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink-soft">First submission</p>
        <p className="font-mono text-sm tabular-nums text-ink">
          {result.marksEarned} / {result.marksAvailable} marks
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((verdict, index) => {
          const disputed = disputedLines.has(index);
          return (
            <div
              key={`${index}-${verdict.studentLine}`}
              className="rounded-xl border border-line bg-surface-raised px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    verdict.undetermined
                      ? 'text-ink-faint'
                      : verdict.matchedLineIndex === null
                        ? 'text-negative'
                        : 'text-positive'
                  }
                >
                  {verdict.undetermined ? '–' : verdict.marksEarned}
                </span>
                <span className="min-w-0 flex-1 break-words font-mono text-sm leading-6 text-ink">
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
                  onClick={() => onToggleDispute(index)}
                  className="shrink-0 text-xs text-ink-faint underline decoration-line-strong underline-offset-4 hover:text-ink"
                >
                  {disputed ? 'Issue reported' : 'Checker got this wrong'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {disputedLines.size > 0 && (
        <p className="mt-3 text-sm leading-5 text-ink-soft">
          This evidence will be kept, but the Question schedule will not change while the checker
          result is disputed.
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
