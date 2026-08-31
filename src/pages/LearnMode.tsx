import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import type { Card, Grade, ItemPayload, ReviewSessionKind } from '../db/types';
import { markLessonComplete } from '../db/repository';
import { LessonNotesIntro } from '../components/learn/LessonNotesIntro';
import { CardEditOverlay } from '../components/cards/CardEditOverlay';
import { KeyHints } from '../components/ui/KeyHints';
import { Button } from '../components/ui/Button';
import { StepSwap } from '../components/ui/StepSwap';
import { SessionReport } from '../components/learn/SessionReport';
import { useDistraction } from '../components/learn/useDistraction';
import type { SessionSummary } from '../components/learn/types';
import { useGradingMode } from '../state/gradingMode';
import { useTypingSetting } from '../state/typingSetting';
import { useAnswerStrictness } from '../state/answerStrictness';
import { useStudyMode } from '../state/studyMode';
import { useStartInFocusMode } from '../state/focusModePreference';
import { useShortcutBindings } from '../state/shortcutBindings';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useIsTouchMode } from '../state/inputMode';
import { CheckIcon, CloseIcon } from '../components/ui/icons';
import { useToast } from '../components/ui/Toast';
import type { CardFilter } from '../db/search';
import { useLearnSession } from './learn/useLearnSession';
import { useLearnKeyboardShortcuts } from './learn/useLearnKeyboardShortcuts';
import { LearnHeader } from './learn/LearnHeader';
import { NavSidebar } from './learn/NavSidebar';
import { TouchBottomSheet } from './learn/TouchBottomSheet';
import { FlipCard } from './learn/FlipCard';
import { NumericStudyFace } from '../components/items/NumericStudyFace';
import { WorkingStudyFace } from '../components/items/WorkingStudyFace';
import { UnknownItemFace } from '../components/items/UnknownItemFace';
import { LearnSkeleton } from './learn/LearnSkeleton';
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
  const exitGuardRef = useRef<NavigationGuardHandle>(null);
  const leavingSessionRef = useRef(false);
  const routeParams = useParams<{ courseId: string; lessonId: string }>();
  const courseId = request?.kind === 'practice' ? request.courseId : routeParams.courseId;
  const lessonId = request?.kind === 'lesson' ? request.lessonId : routeParams.lessonId;
  const [searchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag');
  const simpleModeParam = searchParams.get('mode') === 'simple';
  const practiceNodeKeyParam =
    request?.kind === 'practice' && request.mode === 'curricular'
      ? (request.nodeKey ?? null)
      : searchParams.get('practiceNode');
  const requestScopeLessonIds =
    request?.kind === 'practice' && request.mode !== 'assessment'
      ? request.scopeLessonIds
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
  const filterParams = useMemo(() => searchParams.getAll('filter') as CardFilter[], [searchParams]);
  const navigate = useNavigate();
  const distraction = useDistraction();
  const [gradingMode] = useGradingMode();
  const [typingSetting] = useTypingSetting();
  const [answerStrictness] = useAnswerStrictness();
  const { bindings } = useShortcutBindings();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  const { notify } = useToast();
  const [studyMode] = useStudyMode();
  const [startInFocusMode] = useStartInFocusMode();
  // Course lessons always use the teaching loop; the global preference remains
  // available for ad-hoc deck/global sessions.
  const isSimpleMode = !!lessonId || studyMode === 'simple' || simpleModeParam;

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
    phase,
    singleDeck,
    unitDisplayName,
    lessonNotesScreen,
    setLessonNotesScreen,
    current,
    hintStep,
    setHintStep,
    isTypingCard,
    isMachineMarkedCard,
    hasUnrenderableItemPayload,
    isLinesModeCard,
    occlusion,
    occlusionAnswerText,
    summary,
    setSummary,
    canUndo,
    menuOpen,
    setMenuOpen,
    editing,
    focusMode,
    setFocusMode,
    focusChromeVisible,
    setFocusChromeVisible,
    isFullscreen,
    hintsOpen,
    setHintsOpen,
    navOpen,
    setNavOpen,
    feedback,
    feedbackSource,
    typedAnswer,
    setTypedAnswer,
    typingInputRef,
    sessionCardIds,
    setSessionCardIds,
    sessionCardOutcomes,
    setSessionCardOutcomes,
    schedulerProgress,
    simpleProgress,
    revisionSecondsRemaining,
    revisionWindowBudgetSeconds,
    revisionNextWindowDay,
    setLimitOverride,
    setTimeLimitOverride,
    toggleFullscreen,
    backOut,
    finish,
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
    simpleMastered,
    simpleWrong,
    lessonHasMembersRef,
    persistSimpleResume,
    clearSimpleSessionResume,
  } = useLearnSession({
    courseId,
    lessonId,
    sessionId,
    tagFilter,
    filterParams,
    requestScopeLessonIds,
    practiceNodeKeyParam,
    requestAssessmentId,
    requestPlanId,
    requestWindowId,
    plannedRevision,
    reviewSessionKind,
    isSimpleMode,
    mode,
    navigate,
    onFlowExit,
    onStepFinished,
    notify,
    distraction,
    typingSetting,
    startInFocusMode,
    m,
  });

  // Classic FlipCard grading (self-graded controls, keyboard shortcuts) never
  // applies to a machine-marked item, nor to one whose payload this client
  // can't render at all — see UnknownItemFace and docs/archive/roadmap-2026-08-11.md §11.2 rule 3.
  const suppressClassicGrading = isMachineMarkedCard || hasUnrenderableItemPayload;

  const answerWithUndo = useCallback(
    (input: boolean | Grade | MachineMarkedAnswer, source: 'touch' | 'keyboard' = 'keyboard') => {
      void (async () => {
        const result = await answer(input, source);
        if (result.undoAvailable) {
          notify(result.feedbackMessage ?? 'Answer recorded', 'neutral', {
            actionLabel: 'Undo',
            onAction: () => void undoLast(),
            replaceKey: 'learn-answer',
          });
        }
      })();
    },
    [answer, notify, undoLast],
  );

  useLearnKeyboardShortcuts({
    phase,
    reveal,
    hide,
    answer: answerWithUndo,
    canUndo,
    isLinesModeCard,
    hintStep,
    setHintStep,
    undoLast,
    navOpen,
    setNavOpen,
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

  if (phase === 'loading') {
    return (
      <DelayedFallback>
        <LearnSkeleton mode={mode} />
      </DelayedFallback>
    );
  }

  if (phase === 'notes' && lessonNotesScreen) {
    return (
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
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SessionExitGuard
        ref={exitGuardRef}
        active={() =>
          !leavingSessionRef.current &&
          current !== null &&
          (phase === 'question' || phase === 'answer')
        }
        itemName="Card"
        answeredCount={sessionCardOutcomes.size}
        totalCount={sessionCardIds.length}
        onAttempt={persistSimpleResume}
        onConfirm={() => {
          leavingSessionRef.current = true;
          clearSimpleSessionResume();
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
              onReturn={backOut}
              onContinue={
                summary.reachedGoal &&
                !summary.limitReached &&
                !summary.timeLimitReached &&
                !summary.simpleMode
                  ? undefined
                  : summary.simpleMode
                    ? () => {
                        // Restart simple mode: reset all simple state and begin again.
                        simpleMastered.current = new Set();
                        simpleWrong.current = new Set();
                        simpleQueue.current = cardsRef.current.filter(
                          (c) => !c.suspended && !(c.buriedUntil && c.buriedUntil > Date.now()),
                        );
                        events.current = [];
                        progressBefore.current = 0;
                        sessionStartMs.current = Date.now();
                        setSummary(null);
                        setSessionCardIds(simpleQueue.current.map((card) => card.id));
                        setSessionCardOutcomes(new Map());
                        serveNext();
                      }
                    : () => {
                        const ctx = ctxRef.current;
                        if (!ctx) return;
                        events.current = [];
                        progressBefore.current = cachedSessionProgress(cardsRef.current, ctx);
                        setSummary(null);
                        setLimitOverride(true);
                        setTimeLimitOverride(true);
                        serveNext();
                      }
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
            className="flex min-h-screen flex-col"
          >
            {/* Grading feedback: a directional glow that sweeps in from the side the user
          swiped — left for No, right for Yes — plus a radial ring that pulses outward.
          Purely decorative and never intercepts input. */}
            <AnimatePresence>
              {feedback && (
                <>
                  {feedbackSource === 'touch' ? (
                    <motion.div
                      key={`${feedback}-glow`}
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 * m }}
                      className={
                        'pointer-events-none fixed inset-y-0 z-30 w-56 ' +
                        (feedback === 'right'
                          ? 'right-0 bg-gradient-to-l from-positive/25 to-transparent'
                          : 'left-0 bg-gradient-to-r from-negative/20 to-transparent')
                      }
                    />
                  ) : (
                    <motion.div
                      key={`${feedback}-glow`}
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 * m }}
                      className={
                        'pointer-events-none fixed inset-x-0 bottom-0 z-30 h-40 ' +
                        (feedback === 'right'
                          ? 'bg-gradient-to-t from-positive/25 to-transparent'
                          : 'bg-gradient-to-t from-negative/20 to-transparent')
                      }
                    />
                  )}
                  <motion.div
                    key={`${feedback}-ring`}
                    aria-hidden
                    className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 * m, ease: 'easeOut' }}
                  >
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0.5 }}
                      animate={{ scale: 2.5, opacity: 0 }}
                      transition={{ duration: 0.55 * m, ease: [0.16, 1, 0.3, 1] }}
                      className={
                        'h-96 w-96 rounded-full ' +
                        (feedback === 'right'
                          ? 'bg-positive/15 ring-4 ring-positive/20'
                          : 'bg-negative/10 ring-4 ring-negative/15')
                      }
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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
            {/* Navigation drawer: hidden by default, slides in for quick navigation away. */}
            <NavSidebar open={navOpen} onClose={() => setNavOpen(false)} />
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
                  key="learn-header"
                  mode={mode}
                  plannedRevision={plannedRevision}
                  revisionSecondsRemaining={revisionSecondsRemaining}
                  revisionWindowBudgetSeconds={revisionWindowBudgetSeconds}
                  revisionNextWindowDay={revisionNextWindowDay}
                  singleDeck={singleDeck}
                  unitDisplayName={unitDisplayName}
                  sessionProgress={isSimpleMode ? simpleProgress : schedulerProgress}
                  sessionCardIds={sessionCardIds}
                  sessionCardOutcomes={sessionCardOutcomes}
                  filterParams={filterParams}
                  tagFilter={tagFilter}
                  onOpenNav={() => setNavOpen(true)}
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
                  onEdit={openEdit}
                  onToggleFlag={toggleFlagCurrent}
                  onBury={buryCurrent}
                  onSuspend={suspendCurrent}
                  onShowShortcuts={() => {
                    setMenuOpen(false);
                    setHintsOpen(true);
                  }}
                  m={m}
                  currentCardId={current?.id ?? null}
                />
              )}
            </AnimatePresence>
            {/* Card — mode-aware border accent */}
            {/* The card and its controls centre as one block. Centring the card alone
                leaves it optically high, because the reveal and grade controls sit below
                it and all the remaining height collects underneath them. When a card is
                taller than the viewport this container simply grows, so nothing is
                clipped and the page scrolls as before. */}
            <main
              className={
                'mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center ' +
                'pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] ' +
                'pt-8 md:pt-12 ' +
                (isTouchMode && !suppressClassicGrading
                  ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]'
                  : 'pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-12')
              }
            >
              <AnimatePresence initial={false} mode="popLayout">
                {current && (
                  <motion.div
                    key={current.id}
                    data-study-card-id={current.id}
                    initial={{ opacity: 0, scale: 0.992 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.992 }}
                    transition={{ duration: 0.22 * m, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full"
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
                        navOpen={navOpen}
                        hintsOpen={hintsOpen}
                        onReveal={reveal}
                        onHide={hide}
                        onAnswer={(input) => answerWithUndo(input, 'touch')}
                        typedAnswer={typedAnswer}
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
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Typing input for typing cards in question phase */}
              {!suppressClassicGrading && isTypingCard && phase === 'question' && (
                <div className="mx-auto mt-6 w-full max-w-md">
                  <input
                    ref={typingInputRef}
                    type="text"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        reveal();
                      }
                    }}
                    placeholder="Type your answer…"
                    className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition-colors focus:border-accent"
                    autoFocus
                  />
                  <div className="mt-3 flex justify-center">
                    <Button variant="primary" size="lg" className="w-full" onClick={reveal}>
                      Check answer
                    </Button>
                  </div>
                </div>
              )}

              {/* Controls */}
              {!suppressClassicGrading &&
                (isTouchMode ? (
                  <TouchBottomSheet
                    phase={phase}
                    gradingMode={gradingMode}
                    onReveal={reveal}
                    onHide={hide}
                    onAnswer={answerWithUndo}
                    m={m}
                    isTypingCard={isTypingCard}
                  />
                ) : (
                  <div className="mt-8">
                    <StepSwap
                      stepKey={phase}
                      className={
                        phase === 'question'
                          ? 'flex flex-col items-center gap-2'
                          : 'flex flex-col items-center gap-3'
                      }
                    >
                      {phase === 'question' ? (
                        <>
                          {!isTypingCard && (
                            <Button
                              variant="primary"
                              size="lg"
                              className="w-full max-w-[13.5rem] shadow-lg shadow-accent/15"
                              onClick={reveal}
                            >
                              Show answer
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {gradingMode === 'manual' ? (
                            <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
                              <Button
                                variant="danger"
                                size="lg"
                                className="w-full"
                                onClick={() => answerWithUndo(1, 'keyboard')}
                              >
                                <CloseIcon width={18} height={18} />
                                Again
                              </Button>
                              <Button
                                variant="secondary"
                                size="lg"
                                className="w-full"
                                onClick={() => answerWithUndo(2, 'keyboard')}
                              >
                                Hard
                              </Button>
                              <Button
                                variant="secondary"
                                size="lg"
                                className="w-full"
                                onClick={() => answerWithUndo(3, 'keyboard')}
                              >
                                Good
                              </Button>
                              <Button
                                variant="primary"
                                size="lg"
                                className="w-full"
                                onClick={() => answerWithUndo(4, 'keyboard')}
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
                                onClick={() => answerWithUndo(false, 'keyboard')}
                              >
                                <CloseIcon width={18} height={18} />
                                No
                              </Button>
                              <Button
                                variant="primary"
                                size="lg"
                                className="w-full flex-1"
                                onClick={() => answerWithUndo(true, 'keyboard')}
                              >
                                <CheckIcon width={18} height={18} />
                                Yes
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </StepSwap>
                  </div>
                ))}
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
