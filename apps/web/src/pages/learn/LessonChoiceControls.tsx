import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { QuestionSetChoices } from '../../components/question-sets/QuestionSetChoices';
import '../../components/question-sets/question-set-controls.css';
import { lessonChoices, type LessonChoiceCard } from './simpleLearnQuestions';

export function LessonChoiceControls({
  card,
  promptId,
  candidates,
  rankedIds,
  onCheck,
  onContinue,
}: {
  card: LessonChoiceCard;
  promptId: string;
  candidates: readonly LessonChoiceCard[];
  rankedIds: readonly string[];
  onCheck: (correct: boolean) => boolean;
  onContinue: () => void;
}) {
  // The presentation owns its choices. A ranking that arrives mid-question is for later cards.
  const [choices] = useState(() => lessonChoices(card, candidates, rankedIds));
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState(false);
  const correct = selected === card.answer;

  return (
    <div
      data-study-choices
      className="study-controls study-choice-controls mx-auto mt-6 flex w-full max-w-md shrink-0 flex-col gap-3"
    >
      <QuestionSetChoices
        label="Choose an answer"
        describedBy={promptId}
        value={selected}
        options={choices.map((answer) => ({ value: answer, label: answer }))}
        onChange={setSelected}
        disabled={checked}
        flow
        accentValues={() => checked && correct}
      />
      <div className="flex flex-col gap-3">
        <p role="status" className="min-h-5 text-center text-sm">
          {checked &&
            (correct ? (
              <span className="text-positive">Correct.</span>
            ) : (
              <span className="text-negative">Incorrect. Correct answer: {card.answer}</span>
            ))}
        </p>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!selected}
          data-study-continue={checked ? true : undefined}
          onClick={() => {
            if (checked) onContinue();
            else if (onCheck(correct)) setChecked(true);
          }}
        >
          {checked ? 'Continue' : 'Check answer'}
        </Button>
      </div>
    </div>
  );
}
