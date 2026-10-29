import { useId, useLayoutEffect, type RefObject } from 'react';
import { m as motion } from 'motion/react';
import type { Grade } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { fadeLiftTiming } from '../../components/ui/StepSwap';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { TouchBottomSheet } from './TouchBottomSheet';
import type { AutoMark, Phase } from './types';
import { StudyGradeButton, type StudyGradeFeedback } from './StudyGradeButton';
import { FlowGradeControls } from './FlowGradeControls';

/**
 * Both phases share a grid cell, reserving the larger height before a flip. Desktop
 * cards use Flow controls; touch cards retain their bottom sheet and typed input.
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
  recallPrompt,
  departing = false,
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
  autoMark?: AutoMark;
  recallPrompt?: string;
  departing?: boolean;
  m: number;
}) {
  const question = phase === 'question';
  const recallPromptId = useId();
  const selfRating =
    Boolean(recallPrompt) && !question && gradingMode === 'silent' && !(isTypingCard && autoMark);
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
  // The primary grade comes last: the Flow controls draw its fill.
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
  // While automatic marking owns the answer the grades stay away: the learner
  // self-marks only when it is off or leaves the verdict to them.
  return (
    <>
      {!isTouchMode && (
        <div
          className={`study-controls ${isTypingCard ? 'mt-6' : 'mt-8'} w-full shrink-0`}
          role={selfRating ? 'group' : undefined}
          aria-labelledby={selfRating ? recallPromptId : undefined}
        >
          {recallPrompt && gradingMode === 'silent' && (
            <p
              id={recallPromptId}
              className={`mb-3 text-center text-sm text-ink-soft${selfRating ? '' : ' invisible'}`}
              aria-hidden={!selfRating}
            >
              {recallPrompt}
            </p>
          )}
          <FlowGradeControls
            question={question}
            autoMark={isTypingCard ? autoMark : undefined}
            departing={departing}
            grades={grades}
            rowClassName={gradeRowClassName}
            revealLabel={isTypingCard ? 'Check answer' : 'Show answer'}
            revealLead={isTypingCard ? <div className="mb-3">{typedField}</div> : undefined}
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
          autoMark={autoMark}
          recallPrompt={recallPrompt}
        />
      )}
    </>
  );
}
