import { StudyExitHeader } from '../components/learn/StudyExitHeader';
import { StudyEntrance } from '../components/learn/StudyEntrance';
import './learn/studyLayout.css';
import { typedAnswerJudgement, useTypedAutoMark } from './learn/useTypedAutoMark';
import { PageLoading, PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { LessonNotesIntro } from '../components/learn/LessonNotesIntro';
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
import { useLearnSession } from './learn/useLearnSession';
import { useLearnView } from './learn/useLearnView';
import { useLearnAnswerFeedback } from './learn/useLearnAnswerFeedback';
import { LearnSessionReport } from './learn/LearnSessionReport';
import { LearnStudyPhase } from './learn/LearnStudyPhase';
import { useLearnKeyboardShortcuts } from './learn/useLearnKeyboardShortcuts';
import { useStudyFocus } from './learn/useStudyFocus';
import {
  resolveLearnSessionIds,
  resolveLearnSessionRequest,
  type LearnSessionRequest,
} from '../course/learnSessionRequest';
import { SessionExitGuard } from '../components/learn/SessionExitGuard';
import type { NavigationGuardHandle } from '../components/ui/NavigationGuard';

export type { LearnSessionRequest } from '../course/learnSessionRequest';

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

export function LearnMode(props: LearnModeProps = {}) {
  return (
    <PageLoadingBoundary animateArrival={false}>
      <LearnSession {...props} />
    </PageLoadingBoundary>
  );
}

function LearnSession({ request, onStepFinished, onFlowExit, sessionId }: LearnModeProps) {
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const exitGuardRef = useRef<NavigationGuardHandle>(null);
  const leavingSessionRef = useRef(false);
  const exitDecisionPendingRef = useRef(false);
  const deferredCompletionRef = useRef<SessionSummary | null>(null);
  const completionDeliveriesRef = useRef(0);
  const stepFinished = useCallback(
    (summary: SessionSummary) => {
      completionDeliveriesRef.current += 1;
      if (leavingSessionRef.current) return;
      if (exitDecisionPendingRef.current) deferredCompletionRef.current = summary;
      else onStepFinished?.(summary);
    },
    [onStepFinished],
  );
  const handleLeaveOpenChange = useCallback(
    (open: boolean) => {
      exitDecisionPendingRef.current = open;
      setLeaveConfirmationOpen(open);
      if (open || leavingSessionRef.current) return;
      const deferred = deferredCompletionRef.current;
      deferredCompletionRef.current = null;
      if (deferred) onStepFinished?.(deferred);
    },
    [onStepFinished],
  );
  const routeParams = useParams<{ courseId: string; lessonId: string }>();
  const { lessonId } = resolveLearnSessionIds(request, routeParams);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const distraction = useDistraction();
  const [gradingMode] = useGradingMode();
  const [answerStrictness] = useAnswerStrictness();
  const { bindings } = useShortcutBindings();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [cardDeparting, setCardDeparting] = useState(false);
  const isTouchMode = useIsTouchMode();
  const { notify } = useToast();
  const [studyMode] = useStudyMode();
  const lessonCourse = useLessonCourse(lessonId);
  const sessionReady = !lessonId || lessonCourse !== undefined;
  const [startInFocusMode] = useStartInFocusMode();
  const sessionOptions = useMemo(
    () =>
      resolveLearnSessionRequest({
        request,
        route: { courseId: routeParams.courseId, lessonId: routeParams.lessonId },
        searchParams,
        studyMode,
        lessonLearnFirst: lessonCourse?.learnFirst,
      }),
    [
      request,
      routeParams.courseId,
      routeParams.lessonId,
      searchParams,
      studyMode,
      lessonCourse?.learnFirst,
    ],
  );
  const { courseId, tagFilter, filterParams, isSimpleMode, plannedRevision, mode } = sessionOptions;

  const view = useLearnView(startInFocusMode, notify);
  const {
    menuOpen,
    setMenuOpen,
    focusMode,
    setFocusMode,
    setFocusChromeVisible,
    hintsOpen,
    setHintsOpen,
    typedAnswer,
    setTypedAnswer,
    resetForCard,
    resetForSession,
  } = view;

  const session = useLearnSession({
    enabled: sessionReady,
    ...sessionOptions,
    sessionId,
    navigate,
    onFlowExit,
    onStepFinished: onStepFinished ? stepFinished : undefined,
    notify,
    distraction,
    onCardServed: resetForCard,
    onSessionReset: resetForSession,
  });

  const {
    phase,
    lessonNotesScreen,
    continueFromNotes,
    current,
    hintStep,
    setHintStep,
    isTypingCard: isTypingQuestion,
    presentedAnswerInput,
    isMachineMarkedCard,
    hasUnrenderableItemPayload,
    isLinesModeCard,
    recitationSequence,
    occlusionAnswerText,
    summary,
    canUndo,
    editing,
    sessionCardIds,
    sessionCardOutcomes,
    backOut,
    confirmCompletion,
    settleCompletion,
    reveal,
    hide,
    answer,
    undoLast,
    openEdit,
    persistSimpleResume,
  } = session;

  const isTypingCard = phase === 'answer' ? presentedAnswerInput === 'typed' : isTypingQuestion;

  useEffect(() => {
    if (phase === 'question' && !isTypingCard) setTypedAnswer('');
  }, [phase, isTypingCard, setTypedAnswer]);

  const studyFocusRef = useStudyFocus(current?.id, phase, editing || menuOpen || hintsOpen);

  // Classic FlipCard grading (self-graded controls, keyboard shortcuts) never
  // applies to a machine-marked item, nor to one whose payload this client
  // can't render at all — see UnknownItemFace.
  const suppressClassicGrading =
    isMachineMarkedCard || hasUnrenderableItemPayload || recitationSequence !== null;

  const feedback = useLearnAnswerFeedback({
    answer,
    undoLast,
    confirmCompletion,
    setMenuOpen,
    setTypedAnswer,
    leavingSessionRef,
    notify,
    presentedAnswerInput,
    current,
    typedAnswer,
  });
  const {
    cardTransitionRef,
    manualRestoredCardId,
    confirmingCompletion,
    undoWithTransitionCancel,
    confirmReport,
    answerWithUndo,
    answerSaveStatus,
    settleAnswer,
  } = feedback;

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
  }, [editing, menuOpen, hintsOpen, leaveConfirmationOpen, cardTransitionRef]);

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
      <div className="min-h-dvh bg-paper">
        <StudyExitHeader onExit={backOut} />
        <PageLoading />
      </div>
    );
  }

  if (phase === 'notes' && lessonNotesScreen) {
    return (
      <StudyEntrance>
        <LessonNotesIntro
          lessonName={lessonNotesScreen.lessonName}
          notes={lessonNotesScreen.notes}
          onExit={backOut}
          onContinue={() => void continueFromNotes()}
          motionMultiplier={m}
        />
      </StudyEntrance>
    );
  }

  return (
    <StudyEntrance className="min-h-dvh overflow-x-clip bg-paper">
      <SessionExitGuard
        ref={exitGuardRef}
        onOpenChange={handleLeaveOpenChange}
        active={() =>
          !leavingSessionRef.current &&
          ((current !== null && (phase === 'question' || phase === 'answer')) ||
            (phase === 'finished' && canUndo))
        }
        itemName="Card"
        resumable={isSimpleMode}
        answeredCount={sessionCardOutcomes.size}
        totalCount={sessionCardIds.length}
        answerSaveStatus={answerSaveStatus}
        onAttempt={(source) => {
          if (source === 'navigation') exitDecisionPendingRef.current = true;
          void settleAnswer().catch(() => {});
          cardTransitionRef.current?.cancel();
          persistSimpleResume();
        }}
        onConfirm={async () => {
          leavingSessionRef.current = true;
          try {
            if (answerSaveStatus !== 'failed') await settleAnswer();
            if (!(await settleCompletion())) {
              throw new Error('Session completion could not be saved.');
            }
          } catch (error) {
            leavingSessionRef.current = false;
            throw error;
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
            <LearnSessionReport
              session={session}
              summary={summary}
              onStepFinished={onStepFinished}
              confirmingCompletion={confirmingCompletion}
              undoWithTransitionCancel={undoWithTransitionCancel}
              completionDeliveriesRef={completionDeliveriesRef}
              confirmReport={confirmReport}
              stepFinished={stepFinished}
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
            <LearnStudyPhase
              session={session}
              view={view}
              feedback={feedback}
              mode={mode}
              motionSpeed={motionSpeed}
              isSimpleMode={isSimpleMode}
              isTouchMode={isTouchMode}
              suppressClassicGrading={suppressClassicGrading}
              isTypingCard={isTypingCard}
              gradingMode={gradingMode}
              answerStrictness={answerStrictness}
              typedAutoMark={typedAutoMark}
              typedJudgement={typedJudgement}
              studyFocusRef={studyFocusRef}
              exitGuardRef={exitGuardRef}
              lessonId={lessonId}
              courseId={courseId}
              plannedRevision={plannedRevision}
              filterParams={filterParams}
              tagFilter={tagFilter}
              cardDeparting={cardDeparting}
              setCardDeparting={setCardDeparting}
              m={m}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </StudyEntrance>
  );
}
