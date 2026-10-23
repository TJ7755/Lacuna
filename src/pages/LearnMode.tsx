import { StudyEntrance } from '../components/learn/StudyEntrance';
import './learn/studyLayout.css';
import { StudyControls } from './learn/StudyControls';
import { typedAnswerJudgement, useTypedAutoMark } from './learn/useTypedAutoMark';
import type { JevMarkProvenance } from '../jev';
import type { StudyGradeFeedback } from './learn/StudyGradeButton';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import type { Card, Grade, ItemPayload, ReviewSessionKind } from '../db/types';
import { markLessonComplete } from '../db/lessonRepository';
import { LessonNotesIntro } from '../components/learn/LessonNotesIntro';
import { CardEditOverlay } from '../components/cards/CardEditOverlay';
import { KeyHints } from '../components/ui/KeyHints';
import { SessionReport } from '../components/learn/SessionReport';
import { useDistraction } from '../components/learn/useDistraction';
import type { SessionSummary } from '../components/learn/types';
import { useGradingMode } from '../state/gradingMode';
import { useAnswerStrictness } from '../state/answerStrictness';
import { useStudyMode } from '../state/studyMode';
import { useLessonCourse } from '../state/useCourseData';
import { useStartInFocusMode } from '../state/focusModePreference';
import { useShortcutBindings } from '../state/shortcutBindings';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useIsTouchMode } from '../state/inputMode';
import { useToast } from '../components/ui/Toast';
import type { CardFilter } from '../db/search';
import { useLearnSession } from './learn/useLearnSession';
import { useLearnView } from './learn/useLearnView';
import { useLearnKeyboardShortcuts } from './learn/useLearnKeyboardShortcuts';
import { LearnHeader } from './learn/LearnHeader';
import { FlipCard } from './learn/FlipCard';
import { StudyCardTransition, type StudyCardTransitionHandle } from './learn/StudyCardTransition';
import { StreakCelebration, type StreakMoment } from './learn/StreakCelebration';
import { isStreakMilestone, nextRun } from './learn/answerStreak';
import { useStudyFocus } from './learn/useStudyFocus';
import { NumericStudyFace } from '../components/items/NumericStudyFace';
import { WorkingStudyFace } from '../components/items/WorkingStudyFace';
import { UnknownItemFace } from '../components/items/UnknownItemFace';
import { LearnSkeleton } from './learn/LearnSkeleton';
import { SequenceRecitation } from './learn/recitation/SequenceRecitation';
import type { LearnModeType, LearnSessionRequest, MachineMarkedAnswer } from './learn/types';
import { SessionExitGuard } from '../components/learn/SessionExitGuard';
import type { NavigationGuardHandle } from '../components/ui/NavigationGuard';

export type { LearnSessionRequest } from './learn/types';
export { LearnSkeleton } from './learn/LearnSkeleton';

interface LearnModeProps {
  /** Supplied by CourseStudyFlow; omitted for the existing route-driven sessions. */
  request?: LearnSessionRequest;
  /** Emits only after progression writes have completed, so the caller can safely re-plan. */
  onStepFinished?: (summary: SessionSummary) => void;
  /** Leaves the whole continuous flow rather than merely ending the current step. */
  onFlowExit?: () => void;
  /** Stable identity for a containing continuous study flow. */
  sessionId?: string;
}

export function LearnMode({ request, onStepFinished, onFlowExit, sessionId }: LearnModeProps = {}) {
  const [gradeFeedback, setGradeFeedback] = useState<StudyGradeFeedback>();
  const cardTransitionRef = useRef<StudyCardTransitionHandle>(null);
  // Consecutive correct answers, self-graded or machine-marked, for the milestone celebration.
  const runRef = useRef(0);
  const [streakMoment, setStreakMoment] = useState<StreakMoment | null>(null);
  const clearStreakMoment = useCallback(() => setStreakMoment(null), []);
  const undoInFlightRef = useRef(false);
  const completionInFlightRef = useRef(false);
  const lastTypedAnswerRef = useRef<{ cardId: string; answer: string } | null>(null);
  const [manualRestoredCardId, setManualRestoredCardId] = useState<string | null>(null);
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const exitGuardRef = useRef<NavigationGuardHandle>(null);
  const leavingSessionRef = useRef(false);
  const completionDeliveriesRef = useRef(0);
  const stepFinished = useCallback(
    (summary: SessionSummary) => {
      completionDeliveriesRef.current += 1;
      if (!leavingSessionRef.current) onStepFinished?.(summary);
    },
    [onStepFinished],
  );
  const routeParams = useParams<{ courseId: string; lessonId: string }>();
  const courseId = request?.kind === 'practice' ? request.courseId : routeParams.courseId;
  const lessonId = request?.kind === 'lesson' ? request.lessonId : routeParams.lessonId;
  const [searchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag');
  const simpleModeParam = searchParams.get('mode') === 'simple';
  const standaloneSimple = !request && simpleModeParam;
  const practiceNodeKeyParam =
    request?.kind === 'practice' && request.mode === 'curricular'
      ? (request.nodeKey ?? null)
      : searchParams.get('practiceNode');
  const requestScopeLessonIds =
    request?.kind === 'practice' && request.mode !== 'assessment'
      ? request.scopeLessonIds
      : undefined;
  const requestMilestoneLessonIds =
    request?.kind === 'practice' && request.mode === 'curricular'
      ? request.milestoneLessonIds
      : undefined;
  const requestAssessmentId =
    request?.kind === 'practice' && request.mode === 'assessment'
      ? request.assessmentId
      : undefined;
  const requestPlanId =
    request?.kind === 'practice' && request.mode === 'assessment' ? request.planId : undefined;
  const requestWindowId =
    request?.kind === 'practice' && request.mode === 'assessment' ? request.windowId : undefined;
  const plannedRevision = Boolean(requestAssessmentId && requestPlanId && requestWindowId);
  const reviewSessionKind: ReviewSessionKind = requestAssessmentId
    ? 'assessment-revision'
    : lessonId
      ? 'lesson'
      : courseId
        ? 'practice'
        : 'deck';
  const dueReviewRequest = request?.kind === 'practice' && request.mode === 'recurring';
  const filterParams = useMemo(() => {
    const filters = searchParams.getAll('filter') as CardFilter[];
    return dueReviewRequest && !filters.includes('due') ? [...filters, 'due' as const] : filters;
  }, [searchParams, dueReviewRequest]);
  const navigate = useNavigate();
  const distraction = useDistraction();
  const [gradingMode] = useGradingMode();
  const [answerStrictness] = useAnswerStrictness();
  const { bindings } = useShortcutBindings();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  const { notify } = useToast();
  const [studyMode] = useStudyMode();
  const lessonCourse = useLessonCourse(lessonId);
  const sessionReady = !lessonId || lessonCourse !== undefined;
  const [startInFocusMode] = useStartInFocusMode();
  // Course lessons follow their introduction setting; the global preference remains
  // available for ad-hoc deck/global sessions.
  const isSimpleMode =
    standaloneSimple ||
    (lessonId
      ? lessonCourse?.learnFirst !== false
      : dueReviewRequest ||
          (request?.kind === 'practice' && (request.mode === 'exam' || request.mode === 'catch-up'))
        ? false
        : studyMode === 'simple');

  const mode: LearnModeType = useMemo(() => {
    if (isSimpleMode) return 'simple';
    if (plannedRevision) return 'cram';
    if (filterParams.length > 0) {
      if (filterParams.length === 1) {
        const f = filterParams[0];
        if (f === 'due') return 'filtered-due';
        if (f === 'new') return 'filtered-new';
        if (f === 'leech') return 'filtered-leech';
        if (f === 'flagged') return 'filtered-flagged';
        if (f === 'suspended') return 'filtered-suspended';
      }
      return 'filtered';
    }
    return 'fsrs';
  }, [isSimpleMode, filterParams, plannedRevision]);

  const {
    menuOpen,
    setMenuOpen,
    focusMode,
    setFocusMode,
    focusChromeVisible,
    setFocusChromeVisible,
    isFullscreen,
    toggleFullscreen,
    hintsOpen,
    setHintsOpen,
    typedAnswer,
    setTypedAnswer,
    typingInputRef,
    resetForCard,
    resetForSession,
    closingMenu,
  } = useLearnView(startInFocusMode, notify);

  const {
    phase,
    singleDeck,
    unitDisplayName,
    lessonNotesScreen,
    setLessonNotesScreen,
    current,
    hintStep,
    setHintStep,
    isTypingCard,
    presentedAnswerInput,
    isMachineMarkedCard,
    hasUnrenderableItemPayload,
    isLinesModeCard,
    recitationSequence,
    recitationMasteredItemIds,
    savedRecitationStep,
    saveRecitationStep,
    currentCardIds,
    setRecitationFocus,
    answerRecitation,
    revealRecitation,
    occlusion,
    occlusionAnswerText,
    summary,
    setSummary,
    canUndo,
    editing,
    sessionCardIds,
    setSessionCardIds,
    sessionCardOutcomes,
    schedulerProgress,
    predictedRecall,
    simpleProgress,
    revisionSecondsRemaining,
    revisionWindowBudgetSeconds,
    revisionNextWindowDay,
    setLimitOverride,
    setTimeLimitOverride,
    backOut,
    finish,
    confirmCompletion,
    serveNext,
    serveNextRef,
    reveal,
    hide,
    answer,
    undoLast,
    openEdit,
    cancelEdit,
    handleEdited,
    toggleFlagCurrent,
    suspendCurrent,
    buryCurrent,
    cachedSessionProgress,
    cardsRef,
    ctxRef,
    events,
    progressBefore,
    sessionStartMs,
    simpleQueue,
    createSimpleQueue,
    simpleMastered,
    simpleWrong,
    lessonHasMembersRef,
    persistSimpleResume,
    resetSimpleSessionOutcomes,
  } = useLearnSession({
    enabled: sessionReady,
    courseId,
    lessonId,
    sessionId,
    tagFilter,
    filterParams,
    requestScopeLessonIds,
    requestMilestoneLessonIds,
    practiceNodeKeyParam,
    requestAssessmentId,
    requestPlanId,
    requestWindowId,
    plannedRevision,
    reviewSessionKind,
    isSimpleMode,
    standaloneSimple,
    examPractice: request?.kind === 'practice' && request.mode === 'exam',
    catchUpPractice: request?.kind === 'practice' && request.mode === 'catch-up',
    mode,
    navigate,
    onFlowExit,
    onStepFinished: onStepFinished ? stepFinished : undefined,
    notify,
    distraction,
    onCardServed: resetForCard,
    onSessionReset: resetForSession,
  });

  useEffect(() => {
    if (phase === 'question' && !isTypingCard) setTypedAnswer('');
  }, [phase, isTypingCard, setTypedAnswer]);

  const studyFocusRef = useStudyFocus(current?.id, phase, editing || menuOpen || hintsOpen);

  // Classic FlipCard grading (self-graded controls, keyboard shortcuts) never
  // applies to a machine-marked item, nor to one whose payload this client
  // can't render at all — see UnknownItemFace and docs/spec/learn-mode.md.
  const suppressClassicGrading =
    isMachineMarkedCard || hasUnrenderableItemPayload || recitationSequence !== null;

  const undoWithTransitionCancel = useCallback(async () => {
    if (undoInFlightRef.current || completionInFlightRef.current) return;
    undoInFlightRef.current = true;
    setMenuOpen(false);
    try {
      cardTransitionRef.current?.cancel();
      runRef.current = 0;
      setStreakMoment(null);
      const typed = lastTypedAnswerRef.current;
      if (typed) setManualRestoredCardId(typed.cardId);
      const restored = await undoLast({ reveal: typed !== null });
      if (restored && typed?.cardId === restored.id) {
        setTypedAnswer(typed.answer);
        lastTypedAnswerRef.current = null;
      }
    } finally {
      undoInFlightRef.current = false;
    }
  }, [undoLast, setMenuOpen, setTypedAnswer]);

  const confirmReport = async (then: () => void, leaving = false) => {
    if (completionInFlightRef.current || undoInFlightRef.current) return;
    completionInFlightRef.current = true;
    setConfirmingCompletion(true);
    if (leaving) leavingSessionRef.current = true;
    try {
      if (await confirmCompletion()) then();
      else leavingSessionRef.current = false;
    } finally {
      completionInFlightRef.current = false;
      setConfirmingCompletion(false);
    }
  };

  const answerWithUndo = useCallback(
    (
      input: boolean | Grade | MachineMarkedAnswer,
      source: 'touch' | 'keyboard' = 'keyboard',
      velocity = 0,
      markedBy?: JevMarkProvenance,
      automatic = false,
    ) => {
      if (undoInFlightRef.current) return;
      const commit = () =>
        void (async () => {
          const result = await answer(
            input,
            automatic ? { markedBy, retainUndo: true } : undefined,
          );
          lastTypedAnswerRef.current =
            result.undoAvailable && presentedAnswerInput === 'typed' && current
              ? { cardId: current.id, answer: typedAnswer }
              : null;
          if (result.undoAvailable) {
            notify(result.feedbackMessage ?? 'Answer recorded', 'neutral', {
              actionLabel: 'Undo',
              onAction: () => void undoWithTransitionCancel(),
              replaceKey: 'learn-answer',
            });
          }
        })();
      const correct =
        typeof input === 'object' ? input.correct : typeof input === 'number' ? input > 1 : input;
      // Machine-marked cards measure response time at submission, so keep that path immediate.
      if (typeof input === 'object' || !cardTransitionRef.current) commit();
      else if (!cardTransitionRef.current.dismiss(correct, commit, source, velocity)) return;
      if (typeof input !== 'object') {
        setGradeFeedback((previous) => ({ input, serial: (previous?.serial ?? 0) + 1 }));
      }
      runRef.current = nextRun(runRef.current, correct);
      if (isStreakMilestone(runRef.current)) {
        setStreakMoment({ run: runRef.current, key: Date.now() });
      }
    },
    [answer, notify, undoWithTransitionCancel, presentedAnswerInput, current, typedAnswer],
  );

  const typedAutoMark = useTypedAutoMark({
    card: current,
    phase,
    isTypingCard: presentedAnswerInput === 'typed',
    typedAnswer,
    answerStrictness,
    occlusionAnswerText,
    paused: editing || menuOpen || hintsOpen || leaveConfirmationOpen,
    manual: manualRestoredCardId === current?.id,
    onHold: () => cardTransitionRef.current?.cancel(),
    m,
    onMarked: (correct, provenance) =>
      answerWithUndo(correct, 'keyboard', 0, provenance ?? undefined, true),
  });

  const typedJudgement = useMemo(() => typedAnswerJudgement(typedAutoMark), [typedAutoMark]);

  useEffect(() => {
    if (editing || menuOpen || hintsOpen || leaveConfirmationOpen)
      cardTransitionRef.current?.cancel();
  }, [editing, menuOpen, hintsOpen, leaveConfirmationOpen]);

  useLearnKeyboardShortcuts({
    phase,
    reveal,
    hide,
    answer: answerWithUndo,
    canUndo,
    isLinesModeCard,
    hintStep,
    setHintStep,
    undoLast: undoWithTransitionCancel,
    menuOpen,
    setMenuOpen,
    editing,
    current,
    isTypingCard,
    suppressClassicGrading,
    openEdit,
    hintsOpen,
    setHintsOpen,
    gradingMode,
    bindings,
    m,
    focusMode,
    setFocusMode,
    setFocusChromeVisible,
  });

  useEffect(() => {
    if (phase === 'finished' && summary) {
      window.dispatchEvent(new CustomEvent('lacuna:study-session-end'));
    }
  }, [phase, summary]);

  if (!sessionReady || phase === 'loading') {
    return (
      <DelayedFallback>
        <LearnSkeleton mode={mode} />
      </DelayedFallback>
    );
  }

  if (phase === 'notes' && lessonNotesScreen) {
    return (
      <StudyEntrance>
        <LessonNotesIntro
          lessonName={lessonNotesScreen.lessonName}
          notes={lessonNotesScreen.notes}
          onExit={backOut}
          onContinue={() => {
            void (async () => {
              if (lessonId && cardsRef.current.length === 0 && !lessonHasMembersRef.current) {
                await markLessonComplete(lessonId);
                setLessonNotesScreen(null);
                finish(true);
                return;
              }
              setLessonNotesScreen(null);
              serveNextRef.current();
            })();
          }}
          motionMultiplier={m}
        />
      </StudyEntrance>
    );
  }

  return (
    <StudyEntrance className="min-h-dvh overflow-x-clip bg-paper">
      <SessionExitGuard
        ref={exitGuardRef}
        onOpenChange={setLeaveConfirmationOpen}
        active={() =>
          !leavingSessionRef.current &&
          ((current !== null && (phase === 'question' || phase === 'answer')) ||
            (phase === 'finished' && canUndo))
        }
        itemName="Card"
        resumable={isSimpleMode}
        answeredCount={sessionCardOutcomes.size}
        totalCount={sessionCardIds.length}
        onAttempt={() => {
          cardTransitionRef.current?.cancel();
          persistSimpleResume();
        }}
        onConfirm={async () => {
          leavingSessionRef.current = true;
          if (phase === 'finished' && !(await confirmCompletion())) {
            leavingSessionRef.current = false;
            throw new Error('Session completion could not be saved.');
          }
        }}
        onExplicitLeave={backOut}
      />
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'finished' && summary ? (
          <motion.div
            key="finished"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 * m, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen"
          >
            <SessionReport
              summary={summary}
              returnLabel={onStepFinished ? 'Continue' : 'Done'}
              actionsDisabled={confirmingCompletion}
              onUndo={canUndo ? () => void undoWithTransitionCancel() : undefined}
              onReturn={() => {
                const deliveriesBefore = completionDeliveriesRef.current;
                void confirmReport(() => {
                  if (!onStepFinished) backOut();
                  // A new confirmation delivers automatically. An already-confirmed
                  // report still needs an explicit request to advance its parent.
                  else if (completionDeliveriesRef.current === deliveriesBefore) stepFinished(summary);
                }, !onStepFinished);
              }}
              onContinue={
                onStepFinished ||
                (summary.reachedGoal &&
                  !summary.limitReached &&
                  !summary.timeLimitReached &&
                  !summary.simpleMode)
                  ? undefined
                  : summary.simpleMode
                    ? () =>
                        void confirmReport(() => {
                          // Restart simple mode: reset all simple state and begin again.
                          simpleMastered.current = new Set();
                          simpleWrong.current = new Set();
                          simpleQueue.current = createSimpleQueue(
                            cardsRef.current.filter(
                              (c) => !c.suspended && !(c.buriedUntil && c.buriedUntil > Date.now()),
                            ),
                          );
                          events.current = [];
                          progressBefore.current = 0;
                          sessionStartMs.current = Date.now();
                          setSummary(null);
                          setSessionCardIds(simpleQueue.current.map((card) => card.id));
                          resetSimpleSessionOutcomes();
                          serveNext();
                        })
                    : () =>
                        void confirmReport(() => {
                          const ctx = ctxRef.current;
                          if (!ctx) return;
                          events.current = [];
                          progressBefore.current = cachedSessionProgress(cardsRef.current, ctx);
                          setSummary(null);
                          setLimitOverride(true);
                          setTimeLimitOverride(true);
                          serveNext();
                        })
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="study"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 * m, ease: [0.16, 1, 0.3, 1] }}
            className={
              'study-session flex h-dvh flex-col overflow-hidden' +
              (focusMode ? ' pt-[calc(84px+env(safe-area-inset-top))]' : '')
            }
          >
            {/* In-session card editor: fixes a card without leaving the session (timer paused). */}
            <AnimatePresence>
              {editing && current && (
                <CardEditOverlay
                  card={current}
                  draftScope={lessonId ?? (courseId ? `bank:${courseId}` : undefined)}
                  tagSuggestions={[
                    ...new Set(
                      cardsRef.current
                        .filter((c) => c.schedulingUnitId === current.schedulingUnitId)
                        .flatMap((c) => c.tags ?? []),
                    ),
                  ].sort()}
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
                          onAnswer={(input, source, velocity) =>
                            answerWithUndo(input, source, velocity)
                          }
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
                  // Typed answers start each card afresh; other controls persist so their
                  // grades can flow back into the next card's reveal.
                  key={isTypingCard ? `controls-${current?.id}` : 'controls'}
                  phase={phase}
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
          </motion.div>
        )}
      </AnimatePresence>
    </StudyEntrance>
  );
}
