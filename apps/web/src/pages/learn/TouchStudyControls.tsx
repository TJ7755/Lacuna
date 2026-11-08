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
  onHide,
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
  onHide: () => void;
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
        className={cn(
          'flex min-h-14 items-center justify-end gap-3',
          manual && 'max-sm:min-h-[7.75rem]',
        )}
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
        ) : (
          <>
            {!autoMark &&
              (recallCorrect !== undefined ? (
                <Button
                  variant="primary"
                  size="lg"
                  className={cn(ACTION, 'flex-1')}
                  data-study-continue
                  onClick={() => onAnswer(recallCorrect, 'touch')}
                >
                  Continue
                </Button>
              ) : manual ? (
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  {grade(1, 'Again')}
                  {grade(2, 'Hard')}
                  {grade(3, 'Good')}
                  {grade(4, 'Easy')}
                </div>
              ) : (
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
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
              ))}
            <Button
              variant="secondary"
              size="lg"
              className={cn(ACTION, 'w-14 shrink-0 px-0!')}
              aria-label="Hide answer"
              title="Hide answer"
              onClick={onHide}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.4 6.4A13 13 0 0 0 2 12s3.6 6 10 6a10 10 0 0 0 4.3-.9M9.5 6.3A10 10 0 0 1 12 6c6.4 0 10 6 10 6a14 14 0 0 1-2.7 3.1" />
              </svg>
            </Button>
          </>
        )}
      </StepSwap>
    </div>
  );
}
