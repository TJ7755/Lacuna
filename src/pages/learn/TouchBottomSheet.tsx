import { m as motion } from 'motion/react';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import type { Grade } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { StepSwap } from '../../components/ui/StepSwap';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import type { AutoMark, Phase } from './types';
import { StudyGradeButton, type StudyGradeFeedback } from './StudyGradeButton';

// Thumb-zone grade buttons: tall, squarer than the pill buttons elsewhere, with the
// press scale coming from Button itself.
const GRADE_BUTTON = 'h-16 rounded-[20px] text-[17px]';

export function TouchBottomSheet({
  phase,
  feedback,
  gradingMode,
  onReveal,
  onHide,
  onAnswer,
  m,
  isTypingCard,
  autoMark,
}: {
  phase: Phase;
  feedback?: StudyGradeFeedback;
  gradingMode: 'silent' | 'manual';
  onReveal: () => void;
  onHide: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  m: number;
  isTypingCard?: boolean;
  /** Automatic marking of a typed answer: the self-marking grades stay away. */
  autoMark?: AutoMark;
}) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22 * m, ease: [0.16, 1, 0.3, 1] }}
      className="study-touch-controls fixed bottom-0 left-0 right-0 z-20 overflow-hidden bg-paper pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
      <StepSwap
        stepKey={phase}
        effect="fade-lift"
        className="mx-auto flex max-w-3xl flex-col items-center gap-3"
      >
        {phase === 'question' ? (
          <>
            {isTypingCard ? (
              <p className="text-sm text-ink-faint">Type your answer above, then tap Check</p>
            ) : (
              <p className="text-sm text-ink-faint">Tap the card to reveal</p>
            )}
            {!isTypingCard && (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  hapticLight();
                  onReveal();
                }}
              >
                Show answer
              </Button>
            )}
          </>
        ) : (
          <>
            {!autoMark && (gradingMode === 'manual' ? (
              <div className="grid w-full grid-cols-2 gap-3">
                <StudyGradeButton
                  grade={1}
                  feedback={feedback}
                  m={m}
                  variant="secondary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'w-full border-[1.5px] border-ink bg-surface')}
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(1, 'touch');
                  }}
                >
                  <CloseIcon width={20} height={20} />
                  Again
                </StudyGradeButton>
                <StudyGradeButton
                  grade={2}
                  feedback={feedback}
                  m={m}
                  variant="secondary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'w-full')}
                  onClick={() => {
                    hapticLight();
                    void onAnswer(2, 'touch');
                  }}
                >
                  Hard
                </StudyGradeButton>
                <StudyGradeButton
                  grade={3}
                  feedback={feedback}
                  m={m}
                  variant="secondary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'w-full')}
                  onClick={() => {
                    hapticLight();
                    void onAnswer(3, 'touch');
                  }}
                >
                  Good
                </StudyGradeButton>
                <StudyGradeButton
                  grade={4}
                  feedback={feedback}
                  m={m}
                  variant="primary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'w-full')}
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(4, 'touch');
                  }}
                >
                  <CheckIcon width={20} height={20} />
                  Easy
                </StudyGradeButton>
              </div>
            ) : (
              <div className="flex w-full gap-3">
                <StudyGradeButton
                  grade={false}
                  feedback={feedback}
                  m={m}
                  variant="secondary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'flex-1 border-[1.5px] border-ink bg-surface')}
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(false, 'touch');
                  }}
                >
                  <CloseIcon width={20} height={20} />
                  No
                </StudyGradeButton>
                <StudyGradeButton
                  grade={true}
                  feedback={feedback}
                  m={m}
                  variant="primary"
                  size="lg"
                  className={cn(GRADE_BUTTON, 'flex-1')}
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(true, 'touch');
                  }}
                >
                  <CheckIcon width={20} height={20} />
                  Yes
                </StudyGradeButton>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={onHide}>
              Hide answer
            </Button>
          </>
        )}
      </StepSwap>
    </motion.div>
  );
}
