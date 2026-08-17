import { m as motion } from 'motion/react';
import { hapticLight, hapticMedium } from '../../utils/haptic';
import type { Grade } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { StepSwap } from '../../components/ui/StepSwap';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import type { Phase } from './types';

export function TouchBottomSheet({
  phase,
  gradingMode,
  onReveal,
  onHide,
  onAnswer,
  m,
  isTypingCard,
}: {
  phase: Phase;
  gradingMode: 'silent' | 'manual';
  onReveal: () => void;
  onHide: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  m: number;
  isTypingCard?: boolean;
}) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22 * m, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-0 left-0 right-0 z-20 overflow-hidden rounded-t-3xl border-t border-line-strong bg-surface pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/15"
    >
      <StepSwap
        stepKey={phase}
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
            {gradingMode === 'manual' ? (
              <div className="grid w-full grid-cols-2 gap-3">
                <Button
                  variant="danger"
                  size="lg"
                  className="h-14 w-full"
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(1, 'touch');
                  }}
                >
                  <CloseIcon width={20} height={20} />
                  Again
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-14 w-full"
                  onClick={() => {
                    hapticLight();
                    void onAnswer(2, 'touch');
                  }}
                >
                  Hard
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-14 w-full"
                  onClick={() => {
                    hapticLight();
                    void onAnswer(3, 'touch');
                  }}
                >
                  Good
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="h-14 w-full"
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(4, 'touch');
                  }}
                >
                  <CheckIcon width={20} height={20} />
                  Easy
                </Button>
              </div>
            ) : (
              <div className="flex w-full gap-3">
                <Button
                  variant="danger"
                  size="lg"
                  className="h-14 flex-1"
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(false, 'touch');
                  }}
                >
                  <CloseIcon width={20} height={20} />
                  No
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="h-14 flex-1"
                  onClick={() => {
                    hapticMedium();
                    void onAnswer(true, 'touch');
                  }}
                >
                  <CheckIcon width={20} height={20} />
                  Yes
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={onHide}>
              Hide answer
            </Button>
          </>
        )}
      </StepSwap>
    </motion.div>
  );
}
