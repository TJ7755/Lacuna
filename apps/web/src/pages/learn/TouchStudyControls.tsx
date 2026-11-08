import { useId, type ReactNode } from 'react';
import type { Grade } from '@lacuna/core/db/types';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { StepSwap } from '../../components/ui/StepSwap';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import { StudyGradeButton, type StudyGradeFeedback } from './StudyGradeButton';
import type { AutoMark, Phase } from './types';

const ACTION = 'h-14 rounded-xl';

export function TouchStudyControls({
  phase,
  feedback,
  gradingMode,
  onReveal,
  onAnswer,
  m,
  typedField,
  autoMark,
  recallPrompt,
  recallCorrect,
}: {
  phase: Phase;
  feedback?: StudyGradeFeedback;
  gradingMode: 'silent' | 'manual';
  onReveal: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  m: number;
  typedField?: ReactNode;
  autoMark?: AutoMark;
  recallPrompt?: string;
  recallCorrect?: boolean;
}) {
  const recallPromptId = useId();
  const question = phase === 'question';
  const manual = gradingMode === 'manual';
  const selfRating = Boolean(recallPrompt) && !question && !manual && !autoMark;

  const grade = (input: boolean | Grade, label: ReactNode) => (
    <StudyGradeButton
      grade={input}
      feedback={feedback}
      m={m}
      variant={input === true || input === 4 ? 'primary' : 'secondary'}
      size="lg"
      className={cn(ACTION, 'w-full px-2!')}
      onClick={() => {
        if (input === 2 || input === 3) hapticLight();
        else hapticMedium();
        onAnswer(input, 'touch');
      }}
    >
      {label}
    </StudyGradeButton>
  );

  return (
    <div
      role={selfRating ? 'group' : undefined}
      aria-labelledby={selfRating ? recallPromptId : undefined}
      className="study-touch-controls mx-auto mt-4 w-full max-w-xl shrink-0"
    >
      {recallPrompt && !manual && (
        <p
          id={recallPromptId}
          className={cn('mb-2 text-center text-sm text-ink-soft', !selfRating && 'invisible')}
          aria-hidden={!selfRating}
        >
          {recallPrompt}
        </p>
      )}
      <StepSwap
        stepKey={phase}
        effect="fade-lift"
        className={cn('flex min-h-14 items-center gap-3', manual && 'max-sm:min-h-[7.75rem]')}
      >
        {question ? (
          <>
            {typedField}
            <Button
              variant="primary"
              size="lg"
              className={cn(ACTION, typedField ? 'shrink-0 px-3!' : 'w-full')}
              onClick={() => {
                hapticLight();
                onReveal();
              }}
            >
              {typedField ? 'Check answer' : 'Show answer'}
            </Button>
          </>
        ) : autoMark ? null : recallCorrect !== undefined ? (
          <Button
            variant="primary"
            size="lg"
            className={cn(ACTION, 'w-full')}
            data-study-continue
            onClick={() => onAnswer(recallCorrect, 'touch')}
          >
            Continue
          </Button>
        ) : manual ? (
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {grade(1, 'Again')}
            {grade(2, 'Hard')}
            {grade(3, 'Good')}
            {grade(4, 'Easy')}
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-3">
            {grade(
              false,
              <>
                <CloseIcon width={18} height={18} />
                No
              </>,
            )}
            {grade(
              true,
              <>
                <CheckIcon width={18} height={18} />
                Yes
              </>,
            )}
          </div>
        )}
      </StepSwap>
    </div>
  );
}
