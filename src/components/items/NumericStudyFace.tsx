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
}

export function NumericStudyFace({ card, onAnswer }: NumericStudyFaceProps) {
  const [answer, setAnswer] = useState('');
  const parsed = useMemo(() => (answer.trim() ? parseExpression(answer) : null), [answer]);

  const submit = () => {
    if (!parsed?.ok) return;
    const correct = checkNumeric(parsed.expression, card.payload.answer);
    setAnswer('');
    onAnswer({
      correct,
      marksEarned: correct ? 1 : 0,
      marksAvailable: 1,
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
        <MathsAnswerInput
          value={answer}
          onChange={setAnswer}
          label="Your answer"
          placeholder="Enter your answer"
          autoFocus
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          disabled={!parsed?.ok}
        >
          Check answer
        </Button>
      </form>
    </section>
  );
}
