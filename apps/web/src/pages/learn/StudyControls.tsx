import { useId, useLayoutEffect, type RefObject } from 'react';
import type { Grade } from '@lacuna/core/db/types';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { TouchStudyControls } from './TouchStudyControls';
import type { AutoMark, Phase } from './types';
import { StudyGradeButton, type StudyGradeFeedback } from './StudyGradeButton';
import { FlowGradeControls } from './FlowGradeControls';

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
  onAnswer,
  autoMark,
  recallPrompt,
  recallCorrect,
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
  onAnswer: (input: boolean | Grade, source?: 'touch' | 'keyboard') => void;
  /** Automatic marking of a typed answer: still judging, or the verdict it reached. */
  autoMark?: AutoMark;
  recallPrompt?: string;
  recallCorrect?: boolean;
  departing?: boolean;
  m: number;
}) {
  const question = phase === 'question';
  const localIncorrect = isTypingCard && !question && recallCorrect === false && !autoMark;
  const recallPromptId = useId();
  const selfRating =
    Boolean(recallPrompt) && !question && gradingMode === 'silent' && !(isTypingCard && autoMark);
  useLayoutEffect(() => {
    const input = typingInputRef.current;
    if (!isTypingCard || !input) return;
    if (question) input.focus({ preventScroll: true });
    else if (document.activeElement === input) input.blur();
  }, [question, isTypingCard, isTouchMode, typingInputRef]);
  const grade = (
    input: boolean | Grade,
    variant: 'danger' | 'secondary' | 'primary',
    label: React.ReactNode,
  ) => (
    <StudyGradeButton
      key={String(input)}
      data-study-continue={recallCorrect !== undefined || undefined}
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
    recallCorrect !== undefined
      ? [grade(recallCorrect, 'primary', 'Continue')]
      : gradingMode === 'manual'
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
    recallCorrect !== undefined
      ? 'flex w-full max-w-md'
      : gradingMode === 'manual'
        ? 'grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4'
        : 'flex w-full max-w-md gap-3';
  const typedField = (
    <>
      <label
        htmlFor="study-typed-answer"
        className={isTouchMode ? 'sr-only' : 'mb-2 block text-sm text-ink-soft'}
      >
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
        placeholder={isTouchMode ? 'Your answer' : 'Type your answer…'}
        className={`w-full border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition-colors focus:border-accent ${
          isTouchMode ? 'h-14 min-w-0 flex-1 rounded-xl' : 'rounded-lg'
        }`}
      />
    </>
  );
  const flow = (
    <FlowGradeControls
      question={question}
      autoMark={
        isTypingCard ? (localIncorrect ? { pending: false, correct: false } : autoMark) : undefined
      }
      departing={departing}
      grades={localIncorrect ? [] : grades}
      negativeIndex={recallCorrect === undefined && gradingMode === 'manual' ? 0 : undefined}
      rowClassName={gradeRowClassName}
      revealLabel={isTypingCard ? 'Check answer' : 'Show answer'}
      revealLead={
        isTypingCard && !isTouchMode ? <div className="mb-3">{typedField}</div> : undefined
      }
      onReveal={onReveal}
      m={m}
    />
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
          {flow}
          {localIncorrect && <div className="mx-auto mt-3 flex w-full max-w-md">{grades}</div>}
        </div>
      )}
      {isTouchMode && localIncorrect && (
        <div className="mx-auto mt-4 w-full max-w-xl shrink-0">{flow}</div>
      )}
      {isTouchMode && (
        <TouchStudyControls
          phase={phase}
          feedback={feedback}
          gradingMode={gradingMode}
          onReveal={onReveal}
          onAnswer={onAnswer}
          m={m}
          typedField={isTypingCard ? typedField : undefined}
          autoMark={autoMark}
          recallPrompt={recallPrompt}
          recallCorrect={recallCorrect}
        />
      )}
    </>
  );
}
