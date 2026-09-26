import { useLayoutEffect, type RefObject } from 'react';
import { m as motion } from 'motion/react';
import type { Grade } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { fadeLiftTiming } from '../../components/ui/StepSwap';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { TouchBottomSheet } from './TouchBottomSheet';
import type { Phase } from './types';

/** Both phases share a grid cell, reserving the larger height before a flip. */
export function StudyControls({
  phase,
  isTypingCard,
  isTouchMode,
  gradingMode,
  typedAnswer,
  typingInputRef,
  onTypedAnswer,
  onReveal,
  onHide,
  onAnswer,
  m,
}: {
  phase: Phase;
  isTypingCard: boolean;
  isTouchMode: boolean;
  gradingMode: 'manual' | 'silent';
  typedAnswer: string;
  typingInputRef: RefObject<HTMLInputElement | null>;
  onTypedAnswer: (value: string) => void;
  onReveal: () => void;
  onHide: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  m: number;
}) {
  const question = phase === 'question';
  useLayoutEffect(() => {
    const input = typingInputRef.current;
    if (!isTypingCard || !input) return;
    if (question) input.focus({ preventScroll: true });
    else if (document.activeElement === input) input.blur();
  }, [question, isTypingCard, typingInputRef]);
  return (
    <>
      {(isTypingCard || !isTouchMode) && (
        <div className={'grid w-full ' + (isTypingCard ? 'mt-6' : 'mt-8')}>
          <motion.div
            className="col-start-1 row-start-1 flex w-full flex-col items-center self-start gap-3"
            initial={false}
            animate={{ opacity: question ? 1 : 0 }}
            transition={fadeLiftTiming(question, m)}
            inert={!question}
            aria-hidden={!question}
          >
            {isTypingCard ? (
              <div className="mx-auto w-full max-w-md">
                <label htmlFor="study-typed-answer" className="mb-2 block text-sm text-ink-soft">
                  Your answer
                </label>
                <input
                  id="study-typed-answer"
                  ref={typingInputRef}
                  type="text"
                  value={typedAnswer}
                  onChange={(event) => onTypedAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onReveal();
                    }
                  }}
                  placeholder="Type your answer…"
                  className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition-colors focus:border-accent"
                />
                <div className="mt-3 flex justify-center">
                  <Button variant="primary" size="lg" className="w-full" onClick={onReveal}>
                    Check answer
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full max-w-[13.5rem] shadow-lg shadow-accent/15"
                onClick={onReveal}
              >
                Show answer
              </Button>
            )}
          </motion.div>
          {!isTouchMode && (
            <motion.div
              className="col-start-1 row-start-1 flex w-full flex-col items-center self-start"
              initial={false}
              animate={{ opacity: question ? 0 : 1, y: question && m > 0 ? 14 : 0 }}
              transition={fadeLiftTiming(!question, m)}
              inert={question}
              aria-hidden={question}
            >
              {gradingMode === 'manual' ? (
                <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
                  <Button
                    variant="danger"
                    size="lg"
                    className="w-full"
                    onClick={() => onAnswer(1, 'keyboard')}
                  >
                    <CloseIcon width={18} height={18} />
                    Again
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => onAnswer(2, 'keyboard')}
                  >
                    Hard
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => onAnswer(3, 'keyboard')}
                  >
                    Good
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() => onAnswer(4, 'keyboard')}
                  >
                    <CheckIcon width={18} height={18} />
                    Easy
                  </Button>
                </div>
              ) : (
                <div className="flex w-full max-w-md gap-3">
                  <Button
                    variant="danger"
                    size="lg"
                    className="w-full flex-1"
                    onClick={() => onAnswer(false, 'keyboard')}
                  >
                    <CloseIcon width={18} height={18} />
                    No
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full flex-1"
                    onClick={() => onAnswer(true, 'keyboard')}
                  >
                    <CheckIcon width={18} height={18} />
                    Yes
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
      {isTouchMode && (
        <TouchBottomSheet
          phase={phase}
          gradingMode={gradingMode}
          onReveal={onReveal}
          onHide={onHide}
          onAnswer={onAnswer}
          m={m}
          isTypingCard={isTypingCard}
        />
      )}
    </>
  );
}
