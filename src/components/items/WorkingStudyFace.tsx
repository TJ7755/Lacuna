import { useMemo, useState } from 'react';
import type { Card, ItemPayload } from '../../db/types';
import { verifyWorkingLines } from '../../items/verify';
import type { WorkingVerificationResult } from '../../items/verify';
import type { MachineMarkedAnswer } from '../../pages/learn/types';
import { CardContent } from '../cards/CardContent';
import { Button } from '../ui/Button';

interface WorkingStudyFaceProps {
  card: Card & { payload: Extract<ItemPayload, { kind: 'working' }> };
  onAnswer: (answer: MachineMarkedAnswer) => void;
  allowCheckerDisputes?: boolean;
}

export function WorkingStudyFace({ card, onAnswer, allowCheckerDisputes = true }: WorkingStudyFaceProps) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<(WorkingVerificationResult & { studentLines: string[] }) | null>(null);
  const [disputedLines, setDisputedLines] = useState<Set<number>>(new Set());
  const studentLines = useMemo(() => answerLines(answer), [answer]);

  const submit = () => {
    if (studentLines.length === 0) return;
    const verification = verifyWorkingLines(studentLines, card.payload.scheme, card.id);
    setResult({ ...verification, studentLines });
  };

  const continueStudy = () => {
    if (!result) return;
    setAnswer('');
    setResult(null);
    setDisputedLines(new Set());
    onAnswer({
      correct: result.marksEarned === result.marksAvailable,
      marksEarned: result.marksEarned,
      marksAvailable: result.marksAvailable,
      lineVerdicts: result.lineVerdicts,
      checkerDisputes:
        disputedLines.size > 0
          ? [...disputedLines].map((lineIndex) => {
              const verdict = result.lineVerdicts[lineIndex];
              return {
                reportedAt: Date.now(),
                question: card.front,
                studentLine: verdict.studentLine,
                verdict: {
                  correct: verdict.matchedLineIndex !== null,
                  marksEarned: verdict.marksEarned,
                  matchedLineIndex: verdict.matchedLineIndex,
                  ...(verdict.undetermined ? { undetermined: true as const } : {}),
                },
                checkerSeeds: verdict.checkerSeeds ?? [],
              };
            })
          : undefined,
    });
  };

  return (
    <section className="flex min-h-[22rem] flex-col justify-center rounded-3xl border border-line bg-surface px-6 py-10 shadow-xl shadow-black/5 md:min-h-[29rem] md:px-12 md:py-14">
      <div className="mx-auto w-full max-w-prose text-center text-lg leading-relaxed md:text-xl">
        <CardContent card={card} side="front" />
      </div>
      <form
        className="mx-auto mt-10 w-full max-w-2xl border-t border-line pt-8"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {result ? (
          <div aria-label="Checker result">
            <div className="mb-3 text-right text-sm tabular-nums text-ink-soft">
              {result.marksEarned} / {result.marksAvailable} marks
              {result.undeterminedLines > 0 && (
                <span className="ml-2 font-sans text-xs text-ink-faint">
                  {result.undeterminedLines === 1 ? '1 line unchecked' : `${result.undeterminedLines} lines unchecked`}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {result.lineVerdicts.map((verdict, index) => {
                const disputed = disputedLines.has(index);
                const markTone = verdict.undetermined
                  ? 'text-ink-faint'
                  : verdict.matchedLineIndex === null
                    ? 'text-negative'
                    : 'text-positive';
                return (
                  <div key={`${index}-${verdict.studentLine}`} className="rounded-xl border border-line bg-surface-raised px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className={markTone} aria-label={verdict.undetermined ? 'Not checked' : undefined}>
                        {verdict.undetermined ? '–' : verdict.marksEarned}
                      </span>
                      <span className="min-w-0 flex-1 break-words font-mono text-sm text-ink">
                        {verdict.studentLine}
                        {verdict.undetermined && (
                          <span className="mt-1 block font-sans text-xs text-ink-faint">
                            Lacuna could not check this line, so it earned no marks. Report it if you
                            think it is right.
                          </span>
                        )}
                      </span>
                      {allowCheckerDisputes && (
                        <button
                          type="button"
                          aria-label={`The checker got this wrong for line ${index + 1}`}
                          aria-pressed={disputed}
                          onClick={() => setDisputedLines((previous) => {
                            const next = new Set(previous);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })}
                          className="shrink-0 text-xs text-ink-faint underline decoration-line-strong underline-offset-4 hover:text-ink"
                        >
                          {disputed ? 'Reported' : 'Checker got this wrong'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="primary" size="lg" className="mt-5 w-full" onClick={continueStudy}>
              Continue
            </Button>
          </div>
        ) : (
          <>
            <label htmlFor="working-answer" className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Your working
            </label>
            <textarea
              id="working-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={7}
              placeholder="Write one step per line"
              autoFocus
              className="w-full resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-base leading-7 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={studentLines.length === 0}>
              Check working
            </Button>
          </>
        )}
      </form>
    </section>
  );
}

function answerLines(answer: string): string[] {
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
