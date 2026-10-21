import { useLayoutEffect, type RefObject } from 'react';
import { m as motion } from 'motion/react';
import type { Grade } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { fadeLiftTiming } from '../../components/ui/StepSwap';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { TouchBottomSheet } from './TouchBottomSheet';
import type { Phase } from './types';
import { StudyGradeButton, type StudyGradeFeedback } from './StudyGradeButton';
import { LiquidGradeControls } from './LiquidGradeControls';

/**
 * Both phases share a grid cell, reserving the larger height before a flip. Typed answers
 * fade between their input and the grades; other cards use the liquid controls.
 */
export function StudyControls({
  phase,
  feedback,
  isTypingCard,
  isTouchMode,
  gradingMode,
  typedAnswer,
  typingInputRef,
  onTypedAnswer,
  onReveal,
  onHide,
  onAnswer,
  autoMark,
  m,
}: {
  phase: Phase;
  feedback?: StudyGradeFeedback;
  isTypingCard: boolean;
  isTouchMode: boolean;
  gradingMode: 'manual' | 'silent';
  typedAnswer: string;
  typingInputRef: RefObject<HTMLInputElement | null>;
  onTypedAnswer: (value: string) => void;
  onReveal: () => void;
  onHide: () => void;
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  /** Automatic marking of a typed answer: still judging, or the verdict it reached. */
  autoMark?: { pending: true } | { pending: false; correct: boolean };
  m: number;
}) {
  const question = phase === 'question';
  useLayoutEffect(() => {
    const input = typingInputRef.current;
    if (!isTypingCard || !input) return;
    if (question) input.focus({ preventScroll: true });
    else if (document.activeElement === input) input.blur();
  }, [question, isTypingCard, typingInputRef]);
  const grade = (
    input: boolean | Grade,
    variant: 'danger' | 'secondary' | 'primary',
    label: React.ReactNode,
  ) => (
    <StudyGradeButton
      key={String(input)}
      grade={input}
      feedback={feedback}
      m={m}
      variant={variant}
      size="lg"
      className={gradingMode === 'manual' ? 'w-full' : 'w-full flex-1'}
      onClick={() => onAnswer(input, 'keyboard')}
    >
      {label}
    </StudyGradeButton>
  );
  // The primary grade comes last: the liquid controls draw its fill.
  const grades =
    gradingMode === 'manual'
      ? [
          grade(
            1,
            'danger',
            <>
              <CloseIcon width={18} height={18} />
              Again
            </>,
          ),
          grade(2, 'secondary', 'Hard'),
          grade(3, 'secondary', 'Good'),
          grade(
            4,
            'primary',
            <>
              <CheckIcon width={18} height={18} />
              Easy
            </>,
          ),
        ]
      : [
          grade(
            false,
            'danger',
            <>
              <CloseIcon width={18} height={18} />
              No
            </>,
          ),
          grade(
            true,
            'primary',
            <>
              <CheckIcon width={18} height={18} />
              Yes
            </>,
          ),
        ];
  const gradeRowClassName =
    gradingMode === 'manual'
      ? 'grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4'
      : 'flex w-full max-w-md gap-3';
  const typedField = (
    <>
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
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onReveal();
          }
        }}
        placeholder="Type your answer…"
        className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition-colors focus:border-accent"
      />
    </>
  );
  // A verdict pours the liquid into the grade it chose: Yes or Good, else No or Again.
  const chosen =
    autoMark && !autoMark.pending
      ? autoMark.correct
        ? grades.length - (gradingMode === 'manual' ? 2 : 1)
        : 0
      : undefined;
  return (
    <>
      {!isTypingCard && !isTouchMode && (
        <div className="study-controls mt-8 w-full shrink-0">
          <LiquidGradeControls
            question={question}
            grades={grades}
            rowClassName={gradeRowClassName}
            onReveal={onReveal}
            m={m}
          />
        </div>
      )}
      {isTypingCard && !isTouchMode && (
        <div className="study-controls mt-6 w-full shrink-0">
          <LiquidGradeControls
            question={question}
            pending={autoMark?.pending === true}
            chosen={chosen}
            chosenNegative={chosen === 0}
            grades={grades}
            rowClassName={gradeRowClassName}
            revealLabel="Check answer"
            revealLead={<div className="mb-3">{typedField}</div>}
            onReveal={onReveal}
            m={m}
          />
        </div>
      )}
      {isTypingCard && isTouchMode && (
        <div className="study-controls mt-6 w-full shrink-0">
          <motion.div
            className="mx-auto w-full max-w-md"
            initial={false}
            animate={{ opacity: question ? 1 : 0 }}
            transition={fadeLiftTiming(question, m)}
            inert={!question}
            aria-hidden={!question}
          >
            {typedField}
            <div className="mt-3 flex justify-center">
              <Button variant="primary" size="lg" className="w-full" onClick={onReveal}>
                Check answer
              </Button>
            </div>
          </motion.div>
        </div>
      )}
      {isTouchMode && (
        <TouchBottomSheet
          phase={phase}
          feedback={feedback}
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
