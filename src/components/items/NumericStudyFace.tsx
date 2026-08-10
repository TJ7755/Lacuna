import { useMemo, useState } from 'react';
import type { Card, ItemPayload } from '../../db/types';
import { parseExpression, checkNumeric } from '../../items/verify';
import type { MachineMarkedAnswer } from '../../pages/learn/types';
import { CardContent } from '../cards/CardContent';
import { Button } from '../ui/Button';
import { MathsAnswerInput } from './MathsAnswerInput';

interface NumericStudyFaceProps {
  card: Card & { payload: Extract<ItemPayload, { kind: 'numeric' }> };
  onAnswer: (answer: MachineMarkedAnswer) => void;
  allowCheckerDisputes?: boolean;
}

export function NumericStudyFace({ card, onAnswer, allowCheckerDisputes = true }: NumericStudyFaceProps) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ answer: string; correct: boolean } | null>(null);
  const [disputed, setDisputed] = useState(false);
  const parsed = useMemo(() => (answer.trim() ? parseExpression(answer) : null), [answer]);

  const submit = () => {
    if (!parsed?.ok) return;
    const correct = checkNumeric(parsed.expression, card.payload.answer);
    setResult({ answer: answer.trim(), correct });
  };

  const continueStudy = () => {
    if (!result) return;
    setAnswer('');
    setResult(null);
    setDisputed(false);
    onAnswer({
      correct: result.correct,
      marksEarned: result.correct ? 1 : 0,
      marksAvailable: 1,
      checkerDisputes: disputed
        ? [{
            reportedAt: Date.now(),
            question: card.front,
            studentLine: result.answer,
            verdict: { correct: result.correct, marksEarned: result.correct ? 1 : 0 },
            checkerSeeds: [],
          }]
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
          <div aria-label="Checker result" className="rounded-xl border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-ink">{result.answer}</span>
              <span className={result.correct ? 'text-positive' : 'text-negative'}>
                {result.correct ? '1 / 1 mark' : '0 / 1 marks'}
              </span>
            </div>
            {allowCheckerDisputes && (
              <button
                type="button"
                aria-pressed={disputed}
                onClick={() => setDisputed((value) => !value)}
                className="mt-3 text-sm text-ink-faint underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                {disputed ? 'Checker issue reported' : 'The checker got this wrong'}
              </button>
            )}
            <Button type="button" variant="primary" size="lg" className="mt-5 w-full" onClick={continueStudy}>
              Continue
            </Button>
          </div>
        ) : (
          <>
            <MathsAnswerInput
              value={answer}
              onChange={setAnswer}
              label="Your answer"
              placeholder="Enter your answer"
              autoFocus
            />
            <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={!parsed?.ok}>
              Check answer
            </Button>
          </>
        )}
      </form>
    </section>
  );
}
