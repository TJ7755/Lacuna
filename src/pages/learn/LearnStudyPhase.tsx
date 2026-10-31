import type { RefObject } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Card, ItemPayload } from '../../db/types';
import { CardEditOverlay } from '../../components/cards/CardEditOverlay';
import { KeyHints } from '../../components/ui/KeyHints';
import { NumericStudyFace } from '../../components/items/NumericStudyFace';
import { WorkingStudyFace } from '../../components/items/WorkingStudyFace';
import { UnknownItemFace } from '../../components/items/UnknownItemFace';
import type { NavigationGuardHandle } from '../../components/ui/NavigationGuard';
import type { useGradingMode } from '../../state/gradingMode';
import type { useAnswerStrictness } from '../../state/answerStrictness';
import type { useMotionSpeed } from '../../state/motionSpeed';
import type { CardFilter } from '../../db/search';
import { LearnHeader } from './LearnHeader';
import { FlipCard } from './FlipCard';
import { StudyCardTransition } from './StudyCardTransition';
import { StudyControls } from './StudyControls';
import { StreakCelebration } from './StreakCelebration';
import { SequenceRecitation } from './recitation/SequenceRecitation';
import type { LearnModeType } from './types';
import type { useLearnSession } from './useLearnSession';
import type { useLearnView } from './useLearnView';
import type { useLearnAnswerFeedback } from './useLearnAnswerFeedback';
import type { typedAnswerJudgement, useTypedAutoMark } from './useTypedAutoMark';
import type { useStudyFocus } from './useStudyFocus';

export function LearnStudyPhase({
  session,
  view,
  feedback,
  mode,
  motionSpeed,
  isSimpleMode,
  isTouchMode,
  suppressClassicGrading,
  isTypingCard,
  gradingMode,
  answerStrictness,
  typedAutoMark,
  typedJudgement,
  studyFocusRef,
  exitGuardRef,
  lessonId,
  courseId,
  plannedRevision,
  filterParams,
  tagFilter,
  cardDeparting,
  setCardDeparting,
  m,
}: {
  session: ReturnType<typeof useLearnSession>;
  view: ReturnType<typeof useLearnView>;
  feedback: ReturnType<typeof useLearnAnswerFeedback>;
  mode: LearnModeType;
  motionSpeed: ReturnType<typeof useMotionSpeed>[0];
  isSimpleMode: boolean;
  isTouchMode: boolean;
  suppressClassicGrading: boolean;
  isTypingCard: boolean;
  gradingMode: ReturnType<typeof useGradingMode>[0];
  answerStrictness: ReturnType<typeof useAnswerStrictness>[0];
  typedAutoMark: ReturnType<typeof useTypedAutoMark>;
  typedJudgement: ReturnType<typeof typedAnswerJudgement>;
  studyFocusRef: ReturnType<typeof useStudyFocus>;
  exitGuardRef: RefObject<NavigationGuardHandle | null>;
  lessonId?: string;
  courseId?: string;
  plannedRevision: boolean;
  filterParams: CardFilter[];
  tagFilter: string | null;
  cardDeparting: boolean;
  setCardDeparting: (departing: boolean) => void;
  m: number;
}) {
  const {
    editing,
    current,
    editTagSuggestions,
    handleEdited,
    cancelEdit,
    phase,
    canUndo,
    revisionSecondsRemaining,
    revisionWindowBudgetSeconds,
    revisionNextWindowDay,
    singleDeck,
    unitDisplayName,
    simpleProgress,
    schedulerProgress,
    predictedRecall,
    sessionCardIds,
    sessionCardOutcomes,
    currentCardIds,
    openEdit,
    toggleFlagCurrent,
    buryCurrent,
    suspendCurrent,
    recitationSequence,
    recitationMasteredItemIds,
    answerRecitation,
    setRecitationFocus,
    savedRecitationStep,
    saveRecitationStep,
    revealRecitation,
    isMachineMarkedCard,
    hasUnrenderableItemPayload,
    reveal,
    hide,
    isLinesModeCard,
    hintStep,
    setHintStep,
    occlusion,
    occlusionAnswerText,
  } = session;
  const {
    hintsOpen,
    setHintsOpen,
    focusMode,
    focusChromeVisible,
    menuOpen,
    setFocusChromeVisible,
    setFocusMode,
    toggleFullscreen,
    isFullscreen,
    setMenuOpen,
    closingMenu,
    typedAnswer,
    typingInputRef,
    setTypedAnswer,
  } = view;
  const {
    undoWithTransitionCancel,
    streakMoment,
    clearStreakMoment,
    cardTransitionRef,
    answerWithUndo,
    gradeFeedback,
  } = feedback;
  return (
    <>
      {/* In-session card editor: fixes a card without leaving the session (timer paused). */}
      <AnimatePresence>
        {editing && current && (
          <CardEditOverlay
            card={current}
            draftScope={lessonId ?? (courseId ? `bank:${courseId}` : undefined)}
            tagSuggestions={editTagSuggestions}
            onSaved={handleEdited}
            onCancel={cancelEdit}
          />
        )}
      </AnimatePresence>
      {/* Help overlay (opened with ?) */}
      <KeyHints open={hintsOpen} onClose={() => setHintsOpen(false)} />
      {focusMode && !focusChromeVisible && !menuOpen && (
        <button
          type="button"
          aria-label="Show study controls"
          onPointerEnter={() => setFocusChromeVisible(true)}
          onClick={() => setFocusChromeVisible(true)}
          className="fixed inset-x-0 top-0 z-20 h-[max(0.75rem,env(safe-area-inset-top))] text-transparent focus:h-11 focus:text-ink-faint"
        >
          Show study controls
        </button>
      )}
      {/* Shared top bar: hidden in Focus Mode until the top edge is reached. */}
      <AnimatePresence>
        {(!focusMode || focusChromeVisible || menuOpen) && (
          <LearnHeader
            canUndo={canUndo}
            onUndo={() => void undoWithTransitionCancel()}
            key="learn-header"
            mode={mode}
            plannedRevision={plannedRevision}
            revisionSecondsRemaining={revisionSecondsRemaining}
            revisionWindowBudgetSeconds={revisionWindowBudgetSeconds}
            revisionNextWindowDay={revisionNextWindowDay}
            singleDeck={singleDeck}
            unitDisplayName={unitDisplayName}
            sessionProgress={isSimpleMode ? simpleProgress : schedulerProgress}
            predictedRecall={predictedRecall}
            sessionCardIds={sessionCardIds}
            sessionCardOutcomes={sessionCardOutcomes}
            filterParams={filterParams}
            tagFilter={tagFilter}
            onExit={() => exitGuardRef.current?.requestLeave()}
            focusMode={focusMode}
            onToggleFocus={() => {
              setFocusMode((value) => !value);
              setFocusChromeVisible(false);
            }}
            onToggleFullscreen={() => void toggleFullscreen()}
            isFullscreen={isFullscreen}
            onPointerLeave={() => {
              if (focusMode && !menuOpen) setFocusChromeVisible(false);
            }}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            current={current}
            isTouchMode={isTouchMode}
            onEdit={closingMenu(openEdit)}
            onToggleFlag={closingMenu(toggleFlagCurrent)}
            onBury={closingMenu(buryCurrent)}
            onSuspend={closingMenu(suspendCurrent)}
            onShowShortcuts={() => {
              setMenuOpen(false);
              setHintsOpen(true);
            }}
            m={m}
            currentCardIds={currentCardIds}
          />
        )}
      </AnimatePresence>
      {/* Reserve the controls first; only the card body may scroll. */}
      <main
        ref={studyFocusRef}
        tabIndex={-1}
        aria-label="Study card"
        className={
          'mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col outline-none focus-visible:shadow-none ' +
          'pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] ' +
          'pt-4 md:pt-6 ' +
          (isTouchMode && !suppressClassicGrading
            ? gradingMode === 'manual'
              ? 'pb-[calc(14rem+env(safe-area-inset-bottom))]'
              : 'pb-[calc(10rem+env(safe-area-inset-bottom))]'
            : 'pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6')
        }
      >
        <StreakCelebration moment={streakMoment} multiplier={m} onDone={clearStreakMoment} />
        {current && recitationSequence ? (
          <SequenceRecitation
            key={isSimpleMode ? recitationSequence.id : current.id}
            sequence={recitationSequence}
            masteredItemIds={recitationMasteredItemIds(recitationSequence.id)}
            onCheck={({ results, responseTimeSec, masteredItemIds, done }) =>
              answerRecitation(results, responseTimeSec, done ? 'all' : masteredItemIds)
            }
            onFocusLines={setRecitationFocus}
            savedState={savedRecitationStep(recitationSequence.id)}
            onStateChange={(state) => saveRecitationStep(recitationSequence.id, state)}
            review={
              isSimpleMode || !current.sequenceItemId
                ? undefined
                : {
                    itemId: current.sequenceItemId,
                    onReveal: revealRecitation,
                    onGrade: (correct) => answerWithUndo(correct ? 3 : 1),
                  }
            }
          />
        ) : (
          current && (
            <div className="study-card-slot min-h-0 flex-1">
              <StudyCardTransition
                ref={cardTransitionRef}
                cardId={current.id}
                phase={phase}
                multiplier={m}
                onDepartureChange={setCardDeparting}
              >
                {isMachineMarkedCard && current.payload?.kind === 'numeric' ? (
                  <NumericStudyFace
                    card={
                      current as Card & {
                        payload: Extract<ItemPayload, { kind: 'numeric' }>;
                      }
                    }
                    allowCheckerDisputes={!isSimpleMode}
                    onAnswer={(result) => answerWithUndo(result, 'keyboard')}
                  />
                ) : isMachineMarkedCard && current.payload?.kind === 'working' ? (
                  <WorkingStudyFace
                    card={
                      current as Card & {
                        payload: Extract<ItemPayload, { kind: 'working' }>;
                      }
                    }
                    allowCheckerDisputes={!isSimpleMode}
                    onAnswer={(result) => answerWithUndo(result, 'keyboard')}
                  />
                ) : hasUnrenderableItemPayload ? (
                  <UnknownItemFace card={current} />
                ) : (
                  <FlipCard
                    card={current}
                    revealed={phase === 'answer'}
                    motionSpeed={motionSpeed}
                    phase={phase}
                    isTouchMode={isTouchMode}
                    menuOpen={menuOpen}
                    editing={editing}
                    hintsOpen={hintsOpen}
                    onReveal={reveal}
                    onHide={hide}
                    onAnswer={(input, source, velocity) => answerWithUndo(input, source, velocity)}
                    typedAnswer={typedAnswer}
                    typedJudgement={typedJudgement}
                    isTypingCard={isTypingCard}
                    mode={mode}
                    isLinesModeCard={isLinesModeCard}
                    hintStep={hintStep}
                    onRevealHint={() => setHintStep((s) => (s < 2 ? ((s + 1) as 1 | 2) : s))}
                    hintAffectsScheduling={!isSimpleMode && gradingMode === 'silent'}
                    answerStrictness={answerStrictness}
                    occlusion={occlusion}
                    occlusionAnswerText={occlusionAnswerText}
                  />
                )}
              </StudyCardTransition>
            </div>
          )
        )}

        {isTypingCard && (
          // The Flow fill and the card carry the verdict visually; this says it aloud.
          <div aria-live="polite" className="sr-only">
            {typedAutoMark.state === 'checking'
              ? 'Checking your answer.'
              : typedAutoMark.state === 'marked'
                ? typedAutoMark.correct
                  ? 'Marked correct.'
                  : 'Marked incorrect.'
                : ''}
          </div>
        )}
        {!suppressClassicGrading && (
          <StudyControls
            // Keep the liquid mounted so its draining bead can reform the next pill.
            phase={phase}
            departing={cardDeparting}
            feedback={gradeFeedback}
            isTypingCard={isTypingCard}
            isTouchMode={isTouchMode}
            autoMark={
              typedAutoMark.state === 'checking'
                ? { pending: true }
                : typedAutoMark.state === 'marked'
                  ? { pending: false, correct: typedAutoMark.correct }
                  : undefined
            }
            gradingMode={gradingMode}
            typedAnswer={typedAnswer}
            typingInputRef={typingInputRef}
            onTypedAnswer={setTypedAnswer}
            onReveal={reveal}
            onHide={hide}
            onAnswer={answerWithUndo}
            m={m}
          />
        )}
      </main>
    </>
  );
}
