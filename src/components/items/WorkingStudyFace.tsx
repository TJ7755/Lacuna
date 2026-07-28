import { useMemo, useState } from 'react';
import type { Card, ItemPayload } from '../../db/types';
import { verifyWorkingLines } from '../../items/verify';
import type { MachineMarkedAnswer } from '../../pages/learn/types';
import { CardContent } from '../cards/CardContent';
import { Button } from '../ui/Button';

interface WorkingStudyFaceProps {
  card: Card & { payload: Extract<ItemPayload, { kind: 'working' }> };
  onAnswer: (answer: MachineMarkedAnswer) => void;
}

export function WorkingStudyFace({ card, onAnswer }: WorkingStudyFaceProps) {
  const [answer, setAnswer] = useState('');
  const studentLines = useMemo(() => answerLines(answer), [answer]);

  const submit = () => {
    if (studentLines.length === 0) return;
    const result = verifyWorkingLines(studentLines, card.payload.scheme, card.id);
    setAnswer('');
    onAnswer({
      correct: result.marksEarned === result.marksAvailable,
      ...result,
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
        <label
          htmlFor="working-answer"
          className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint"
        >
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
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          disabled={studentLines.length === 0}
        >
          Check working
        </Button>
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
