import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { useToast } from '../../components/ui/Toast';
import { createRevisionSessionState } from '../../course/revisionSession';
import type { SessionCardOutcome, SessionSummary } from '../../course/sessionSummary';
import { pauseAssetGc } from '../../db/assets';
import { buryCard, setCardFlag, suspendCard } from '../../db/cardRepository';
import { markLessonComplete } from '../../db/lessonRepository';
import { type OcclusionCardData } from '../../db/occlusionStudy';
import { makeId } from '../../db/schema';
import type { CardFilter } from '@lacuna/core/db/search';
import { isLabelCardId } from '../../db/sequenceGeneration';
import type {
  Card,
  Lesson,
  ReviewSessionKind,
  RevisionPlan,
  SchedulerConfig,
  Sequence,
  UserPerformance,
} from '@lacuna/core/db/types';
import { progressHeading } from '../../fsrs/objective';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import type { SessionContext } from '../../fsrs/session';
import { sessionCompletionProgress, sessionProgress, sessionServePool } from '../../fsrs/session';
import type { JevMarkProvenance } from '@lacuna/core/jev/types';
import { useAnswerInput } from '../../state/answerInput';
import { startOfDay } from '../../utils/datetime';
import { useLeaveFlowWith } from '../../utils/editorOrigin';
import { resolveAnswerMode, reviewAnswerInput } from '../../utils/resolveAnswerMode';
import { answerCorrect, type AnswerInput, type AnswerResult } from './answerSteps';
import { loadSessionData } from './loadSessionData';
import { loadSessionSource } from './loadSessionSource';
import { shuffledSimpleQueue } from './recitation/recitationFlow';
import { createSessionAnswerEffects, type AnswerResponse } from './sessionAnswerEffects';
import { type AnswerSnapshot } from './sessionAnswerPersistence';
import { hasMachineMarkedPayload, isUnrenderableItemPayload } from './sessionCardCapabilities';
import {
  persistSessionCompletion,
  persistSessionPracticeMilestone,
  type PracticeSession,
} from './sessionCompletionPersistence';
import {
  transitionCompletion,
  transitionResponseTimer,
  transitionSession,
  type CompletionEvent,
  type SessionEventInput,
  type SessionState,
} from './sessionMachine';
import { preloadSessionImages, sessionPreloadCards } from './sessionPreload';
import { emptySessionState, sessionCell, simpleSessionCell } from './sessionRuntime';
import { resolveLearnSessionScope } from './sessionScope';
import { clearSimpleSession, saveSimpleSession } from './simpleSessionPersistence';
import type { LearnModeType, LessonNotesScreen, Phase, StudyUnit } from './types';

export type { AnswerResult } from './answerSteps';

type SessionSchedulingConfig = SchedulerConfig & {
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
};

export interface UseLearnSessionParams {
  enabled?: boolean;
  courseId: string | undefined;
  lessonId: string | undefined;
  sessionId: string | undefined;
  tagFilter: string | null;
  filterParams: CardFilter[];
  requestScopeLessonIds: string[] | undefined;
  requestSpecificationPointId?: string;
  /** Fixed lesson prefix of a curricular node's milestone; undefined records no milestone. */
  requestMilestoneLessonIds?: string[];
  requestReviewLimit?: number;
  practiceNodeKeyParam: string | null;
  requestAssessmentId: string | undefined;
  requestPlanId: string | undefined;
  requestWindowId: string | undefined;
  plannedRevision: boolean;
  reviewSessionKind: ReviewSessionKind;
  isSimpleMode: boolean;
  /** An explicitly requested pass, independent of curricular introductions and practice. */
  standaloneSimple?: boolean;
  /** Optional revision below a future exam target, without a curricular scope. */
  earlyReview?: boolean;
  examPractice?: boolean;
  catchUpPractice?: boolean;
  mode: LearnModeType;
  navigate: NavigateFunction;
  onFlowExit?: () => void;
  onStepFinished?: (summary: SessionSummary) => void;
  notify: ReturnType<typeof useToast>['notify'];
  distraction: DistractionTracker;
  /** Called whenever a card is served, so per-card view state can reset. */
  onCardServed?: () => void;
  /** Called when the session (re)loads, so session view state can reset. */
  onSessionReset?: () => void;
}

/**
 * Owns Learn mode's session state and card-serving/answer/undo/cooldown/revision-plan
 * logic: everything from the initial deck/course/assessment load through grading,
 * undo, and session completion (including assessment revision-plan windows).
 */
export function useLearnSession({
  enabled = true,
  courseId,
  lessonId,
  sessionId,
  tagFilter,
  filterParams,
  requestScopeLessonIds,
  requestSpecificationPointId,
  requestMilestoneLessonIds,
  requestReviewLimit,
  practiceNodeKeyParam,
  requestAssessmentId,
  requestPlanId,
  requestWindowId,
  plannedRevision,
  reviewSessionKind,
  isSimpleMode,
  standaloneSimple = false,
  earlyReview = false,
  examPractice = false,
  catchUpPractice = false,
  mode,
  navigate,
  onFlowExit,
  onStepFinished,
  notify,
  distraction,
  onCardServed,
  onSessionReset,
}: UseLearnSessionParams) {
  const reviewSessionIdRef = useRef(sessionId ?? makeId());

  // Exactly one of courseId/lessonId is set by the matching route (or neither,
  // for the cross-course Review today session). The lesson route (/lesson/:lessonId/learn)
  // carries no courseId, so it is resolved from the loaded lesson (see resolvedCourseId).
  const requestScopeLessonIdsIdentity = requestScopeLessonIds?.join('\0');
  const filterParamsIdentity = filterParams.join('\0');
  const requestMilestoneLessonIdsKey = requestMilestoneLessonIds?.join('\0');
  const sessionScope = useMemo(
    () =>
      resolveLearnSessionScope({
        courseId,
        lessonId,
        sessionId,
        tagFilter,
        // Pass the original arrays: deriving them from the serialised identities turns
        // an empty scope into [''] (''.split('\0')), which persists under a different
        // Simple-resume key than the loading effect's empty set. The identities stay
        // as memo dependencies only.
        filterParams,
        requestScopeLessonIds,
        practiceNodeKey: practiceNodeKeyParam,
        assessmentId: requestAssessmentId,
        planId: requestPlanId,
        windowId: requestWindowId,
      }),
    // The serialised identities are the memo triggers: depending on the raw arrays
    // would rebuild the scope (and reload the session) whenever the caller passes a
    // rebuilt-but-equal array. Their content always changes the key when it changes,
    // so reading the arrays inside cannot go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      courseId,
      lessonId,
      sessionId,
      tagFilter,
      filterParamsIdentity,
      requestScopeLessonIdsIdentity,
      practiceNodeKeyParam,
      requestAssessmentId,
      requestPlanId,
      requestWindowId,
    ],
  );
  const {
    isLessonScoped,
    isCourseScoped,
    isGlobal,
    requestScopeLessonIdsKey,
    filterParamsKey,
    simpleSessionScope: curricularSimpleScope,
  } = sessionScope;
  const simpleSessionScope = useMemo(
    () =>
      standaloneSimple ? { ...curricularSimpleScope, standalone: true } : curricularSimpleScope,
    [curricularSimpleScope, standaloneSimple],
  );

  // Latest view callbacks, read through refs so serving and loading never depend on
  // the caller's callback identity.
  const onCardServedRef = useRef(onCardServed);
  onCardServedRef.current = onCardServed;
  const onSessionResetRef = useRef(onSessionReset);
  onSessionResetRef.current = onSessionReset;

  useEffect(() => (enabled ? pauseAssetGc() : undefined), [enabled]);

  const machineState = useRef<SessionState>(emptySessionState());
  const [phase, setPhase] = useState<Phase>('loading');
  // The unit a single-unit session is studying (null for the global session).
  const [singleDeck, setSingleDeck] = useState<StudyUnit | null>(null);
  // Display name for the header: the lesson's own name under lesson scope (its
  // scheduling unit is the parent Course, whose name would otherwise show instead).
  const [unitDisplayName, setUnitDisplayName] = useState<string | null>(null);
  // The course id backing a course/lesson-scoped session. Known directly from the
  // route for /course/:courseId/learn; resolved from the lesson for /lesson/:lessonId/learn
  // (that route carries no courseId param). Used for exitTo and the unlock ratchet.
  const [resolvedCourseId, setResolvedCourseId] = useState<string | null>(null);
  // Set for a course/lesson-scoped session opening on a lesson that has never
  // been studied before (see the loading effect) — shown as a 'notes' phase
  // ahead of the first card, with a continue action that starts serving cards.
  const [lessonNotesScreen, setLessonNotesScreen] = useState<LessonNotesScreen | null>(null);
  const answerModeLessonsRef = useRef<Map<string, Lesson>>(new Map());
  const [current, setCurrent] = useState<Card | null>(null);
  // Cards in this session's pool generated from a lines-mode Sequence, mapped to their
  // owning Sequence — loaded once alongside the card pool (see linesModeCards.ts). Drives
  // the first-letter hint step, which only applies to lines-mode recall cards.
  const linesModeMapRef = useRef<Map<string, Sequence>>(new Map());
  // Occlusion-generated cards in this session's pool, mapped to their owning Occlusion
  // and resolved typed-mode answer text — loaded once alongside the card pool (see
  // occlusionStudy.ts). Drives both the study face's diagram rendering and per-card
  // typed-mode eligibility (§6.5: offered only where the target region has answerText).
  const occlusionMapRef = useRef<Map<string, OcclusionCardData>>(new Map());
  // The lines-mode hint ladder step the learner has reached for the current card: 0 = no
  // hint requested, 1 = first-letter hint, 2 = first-words hint. Reset per card. See
  // src/components/learn/LineHint.tsx for the two steps and src/utils/firstLetterHint.ts /
  // firstWordsHint.ts for the pure hint builders.
  const [hintStep, setHintStep] = useState<0 | 1 | 2>(0);
  // An occlusion-generated card's typing eligibility is decided per-card by whether its
  // region resolves an answerText, never by the authored answer-mode check that applies
  // to ordinary front_back cards — its plain-text `back` fallback is not a typing target.
  const currentOcclusionData =
    current !== null ? (occlusionMapRef.current.get(current.id) ?? null) : null;
  const presentedAnswerInput = useRef<AnswerResponse['input']>(undefined);
  const [answerInputPreference] = useAnswerInput();
  const lessonAnswerMode = answerModeLessonsRef.current.get(
    lessonId ?? current?.primaryLessonId ?? '',
  )?.answerMode;
  const occlusionAnswerText = currentOcclusionData?.answerText;
  const isTypingCard = useMemo(
    () =>
      current !== null &&
      resolveAnswerMode(current, lessonAnswerMode, answerInputPreference, occlusionAnswerText) ===
        'type',
    [current, lessonAnswerMode, answerInputPreference, occlusionAnswerText],
  );
  const isMachineMarkedCard = hasMachineMarkedPayload(current);
  // A payload the current client cannot render as a study face at all: present but
  // not machine-markable (unknown v, or a known-but-unbuilt kind such as `scaffold`).
  // Renders read-only via UnknownItemFace — never a wrong FSRS mark.
  const hasUnrenderableItemPayload = isUnrenderableItemPayload(current);
  // Whether the current card was generated from a lines-mode Sequence (see
  // linesModeCards.ts) — drives the optional first-letter hint step in the question phase.
  const isLinesModeCard = current !== null && linesModeMapRef.current.has(current.id);
  // A lines-mode line is studied by recitation (see recitation/recitationFlow.ts): Simple
  // mode learns the whole sequence cumulatively, and scheduled sessions recite the line's
  // chunk up to it. Label cards stay ordinary cards.
  const recitationSequence =
    current?.sequenceItemId && !isLabelCardId(current.sequenceItemId)
      ? (linesModeMapRef.current.get(current.id) ?? null)
      : null;
  // Cache sessionProgress so repeated calls while the card pool is unchanged don't recompute.
  const progressCacheRef = useRef<{ dirty: boolean; value: number }>({ dirty: true, value: 0 });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  // When set, the in-session edit overlay is open for the current card. While it is
  // open the FSRS response timer is paused (see openEdit/resumeTimer) so time spent
  // fixing a card never counts towards the invisible grade.
  const [editing, setEditing] = useState(false);
  // Simple mode: queue of cards that are still unlearned (wrong or unseen).
  const simpleQueue = useRef(simpleSessionCell(machineState, 'queue')).current;
  const simpleMastered = useRef(simpleSessionCell(machineState, 'mastered')).current;
  const simpleWrong = useRef(simpleSessionCell(machineState, 'wrong')).current;
  // Simple mode: in-progress recitation steps by sequence id, saved with the session.
  const simpleRecitations = useRef<Map<string, unknown>>(new Map());
  const [sessionCardIds, renderSessionCardIds] = useState<string[]>([]);
  const sessionCardIdsRef = useRef(sessionCell(machineState, 'cardIds')).current;
  const setSessionCardIds = useCallback(
    (value: string[] | ((previous: string[]) => string[])) => {
      const next = typeof value === 'function' ? value(sessionCardIdsRef.current) : value;
      sessionCardIdsRef.current = next;
      renderSessionCardIds(next);
    },
    [sessionCardIdsRef],
  );
  const [sessionCardOutcomes, setSessionCardOutcomes] = useState<Map<string, SessionCardOutcome>>(
    () => new Map(),
  );
  const sessionCardOutcomesRef = useRef(sessionCell(machineState, 'outcomes')).current;
  const [schedulerProgress, setSchedulerProgress] = useState(0);
  const [revisionSecondsRemaining, setRevisionSecondsRemaining] = useState(0);
  const [revisionWindowBudgetSeconds, setRevisionWindowBudgetSeconds] = useState(0);
  const [revisionNextWindowDay, setRevisionNextWindowDay] = useState<string | undefined>();
  const simpleProgress = useMemo(() => {
    if (sessionCardIds.length === 0) return 0;
    let completed = 0;
    sessionCardIds.forEach((id) => {
      if (sessionCardOutcomes.get(id) === 'correct') completed += 1;
    });
    return completed / sessionCardIds.length;
  }, [sessionCardIds, sessionCardOutcomes]);

  useEffect(() => {
    if (!plannedRevision) return;
    const update = () => {
      setRevisionSecondsRemaining(
        Math.max(
          0,
          revisionWindowBudgetSeconds - (Date.now() - revisionWindowStartedAt.current) / 1000,
        ),
      );
    };
    update();
    const id = window.setInterval(update, 1_000);
    return () => window.clearInterval(id);
  }, [plannedRevision, revisionWindowBudgetSeconds]);

  // Session-only mutable state held in refs so it never triggers re-renders mid-card
  // and so the stable callbacks below always read current values (no stale closures).
  const cooldowns = useRef(sessionCell(machineState, 'cooldowns')).current;
  const perfRef = useRef<Map<string, UserPerformance>>(new Map());
  const schedulingUnitsRef = useRef<Map<string, StudyUnit>>(new Map());
  // Every session scores and enforces limits from the target scheduling projection.
  const schedulingConfigRef = useRef<SessionSchedulingConfig | null>(null);
  const ctxRef = useRef<SessionContext | null>(null);
  // Whether reviews in this session should be recorded against a Course (course
  // and lesson scope) or a scheduling unit (the global "Today" session).
  const reviewKindRef = useRef<'scheduling-unit' | 'course'>('scheduling-unit');
  // Set for course/lesson-scoped sessions so a completed session can evaluate the
  // semi-linear unlock ratchet (see sessionUnlocks.ts). Null for deck/global sessions.
  const ratchetCourseIdRef = useRef<string | null>(null);
  // Set only for lesson scope, so ratchetSessionUnlocks knows which single lesson to
  // evaluate (course/practice-scope completion instead sweeps every lesson).
  const ratchetLessonIdRef = useRef<string | null>(null);
  const cardsRef = useRef(sessionCell(machineState, 'cards')).current;
  const createSimpleQueue = useCallback(
    (cards: Card[]) => shuffledSimpleQueue(cards, linesModeMapRef.current),
    [],
  );
  // Simple mode's progress bar highlights the recited lines rather than the card that
  // opened the recitation; SequenceRecitation reports them as item ids.
  const [recitationFocus, setRecitationFocus] = useState<string[]>([]);
  const currentCardIds = useMemo(() => {
    if (!current) return [];
    if (!recitationSequence || !isSimpleMode) return [current.id];
    const ids = cardsRef.current.flatMap((card) =>
      card.sequenceItemId &&
      recitationFocus.includes(card.sequenceItemId) &&
      linesModeMapRef.current.get(card.id)?.id === recitationSequence.id
        ? [card.id]
        : [],
    );
    return ids.length > 0 ? ids : [current.id];
  }, [current, recitationSequence, isSimpleMode, cardsRef, recitationFocus]);
  const lessonExposureIdRef = useRef<string | null>(null);
  const lessonHasMembersRef = useRef(false);
  const practiceSessionRef = useRef<PracticeSession | null>(null);
  const revisionPlanRef = useRef<RevisionPlan | null>(null);
  const revisionInitialRevision = useRef(0);
  const revisionWindowStartedAt = useRef(0);
  const revisionSessionRef = useRef(sessionCell(machineState, 'revision')).current;
  const timerStart = useRef(0);
  const responseTime = useRef(0);
  // Elapsed thinking time captured when the edit overlay opens during the question
  // phase, so the timer can be rebased (not reset) when the overlay closes.
  const pausedElapsed = useRef(0);
  const events = useRef(sessionCell(machineState, 'events')).current;
  const progressBefore = useRef(0);
  const lastAnswer = useRef<AnswerSnapshot | null>(null);
  // Guards against a double key-press / click submitting the same card twice.
  const submitting = useRef(false);
  const finalising = useRef(false);
  const pendingCompletion = useRef<SessionSummary | null>(null);
  const completionPromise = useRef<Promise<boolean> | null>(null);
  const completionConfirmed = useRef(false);
  // Retained across a failed submission retry; cleared only when the player advances.
  const pendingReviewEventId = useRef<string | null>(null);
  // Per-unit counts from canonical events for the current local calendar day.
  const reviewsByDeck = useRef<Map<string, number>>(new Map());
  const reviewsDayStart = useRef(0);
  // When the user clicks "Continue anyway" after hitting a daily limit.
  const [limitOverride, setLimitOverride] = useState(false);
  // When the user clicks "Continue anyway" after hitting a session time limit.
  const [timeLimitOverride, setTimeLimitOverride] = useState(false);
  // Session wall-clock start time, used to enforce the per-deck session time limit.
  const sessionStartMs = useRef(0);
  // Cache sessionProgress so repeated calls while the card pool is unchanged don't recompute.
  // Stable refs for values that async callbacks must read fresh (avoid stale closures).
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const currentRef = useRef<Card | null>(current);
  currentRef.current = current;
  const hintStepRef = useRef<0 | 1 | 2>(hintStep);
  hintStepRef.current = hintStep;
  // Guards against state updates on an unmounted component after async work.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const readSessionState = () => machineState.current;
  const applySessionEvent = (event: SessionEventInput) => {
    const transition = transitionSession(machineState.current, event);
    machineState.current = transition.state;
    setSessionCardOutcomes(transition.state.outcomes);
    setSessionCardIds(transition.state.cardIds);
    return transition.effects;
  };
  const applySessionEventRef = useRef(applySessionEvent);
  applySessionEventRef.current = applySessionEvent;
  const readSessionStateRef = useRef(readSessionState);
  readSessionStateRef.current = readSessionState;
  const advanceTimer = (event: Parameters<typeof transitionResponseTimer>[1]) => {
    const next = transitionResponseTimer(
      {
        startedAt: timerStart.current,
        responseSeconds: responseTime.current,
        pausedElapsed: pausedElapsed.current,
      },
      event,
    );
    timerStart.current = next.startedAt;
    responseTime.current = next.responseSeconds;
    pausedElapsed.current = next.pausedElapsed;
  };
  const applyCompletionEvent = (event: CompletionEvent) => {
    const transition = transitionCompletion(
      {
        finalising: finalising.current,
        confirmed: completionConfirmed.current,
        pending: pendingCompletion.current,
      },
      event,
    );
    finalising.current = transition.state.finalising;
    completionConfirmed.current = transition.state.confirmed;
    pendingCompletion.current = transition.state.pending;
    return transition.effects;
  };
  const exitTo = isLessonScoped
    ? resolvedCourseId
      ? `/course/${resolvedCourseId}/lesson/${lessonId}`
      : '/'
    : isCourseScoped
      ? `/course/${courseId}`
      : '/';
  const leaveFlow = useLeaveFlowWith(navigate, exitTo);
  const backOut = useCallback(() => {
    if (onFlowExit) onFlowExit();
    else leaveFlow();
  }, [leaveFlow, onFlowExit]);

  const persistSimpleResume = useCallback(
    (outcomes: Map<string, SessionCardOutcome> = sessionCardOutcomesRef.current) => {
      if (!isSimpleMode) return;
      saveSimpleSession(simpleSessionScope, {
        queueCardIds: simpleQueue.current.map((card) => card.id),
        masteredCardIds: [...simpleMastered.current],
        outcomes,
        events: events.current,
        recitations: simpleRecitations.current,
      });
    },
    [events, isSimpleMode, sessionCardOutcomesRef, simpleMastered, simpleQueue, simpleSessionScope],
  );

  const resetSimpleSessionOutcomes = useCallback(() => {
    const outcomes = new Map<string, SessionCardOutcome>();
    sessionCardOutcomesRef.current = outcomes;
    setSessionCardOutcomes(outcomes);
  }, [sessionCardOutcomesRef]);

  const objectiveLabel = useCallback(() => {
    if (isSimpleMode) return 'Cards correct in this pass';
    if (singleDeck) return progressHeading(singleDeck);
    return 'Predicted readiness across all courses';
  }, [isSimpleMode, singleDeck]);

  /** Compute sessionProgress with a lightweight dirty-check cache. */
  const cachedSessionProgress = useCallback((cards: Card[], ctx: SessionContext): number => {
    if (!progressCacheRef.current.dirty) {
      return progressCacheRef.current.value;
    }
    const value = sessionProgress(cards, ctx);
    progressCacheRef.current = { dirty: false, value };
    return value;
  }, []);

  const persistPracticeMilestone = useCallback(
    async (cards: Card[], completed: boolean): Promise<void> => {
      await persistSessionPracticeMilestone(practiceSessionRef.current, cards, completed);
    },
    [],
  );

  /**
   * Commit a provisional report exactly once. False keeps the report and Undo
   * available after a failure; callers must await true before leaving/continuing.
   */
  const confirmCompletion = useCallback((): Promise<boolean> => {
    if (completionPromise.current) return completionPromise.current;
    if (submitting.current && lastAnswer.current?.retainOnCompletion) return Promise.resolve(false);
    const nextSummary = pendingCompletion.current;
    if (!nextSummary) return Promise.resolve(completionConfirmed.current);
    const commit = async (): Promise<boolean> => {
      try {
        const { deliveredSummary, completedPlan } = await persistSessionCompletion(
          nextSummary,
          requestWindowId,
          () => ({
            revisionPlan: revisionPlanRef.current,
            initialRevision: revisionInitialRevision.current,
            sessionId: reviewSessionIdRef.current,
            startedAt: revisionWindowStartedAt.current,
            covered: revisionSessionRef.current.covered,
            improved: revisionSessionRef.current.improved,
            parked: revisionSessionRef.current.parked,
            reviewEventIds: revisionSessionRef.current.reviewEventIds,
            context: ctxRef.current,
            cards: cardsRef.current,
            practice: practiceSessionRef.current,
            ratchetCourseId: ratchetCourseIdRef.current,
            ratchetLessonId: ratchetLessonIdRef.current,
          }),
        );
        revisionPlanRef.current = completedPlan;
        if (isSimpleMode && deliveredSummary.reachedGoal) clearSimpleSession(simpleSessionScope);
        applyCompletionEvent({ type: 'confirmed' });
        lastAnswer.current = null;
        if (mountedRef.current) {
          setCanUndo(false);
          setSummary(deliveredSummary);
          setPhase('finished');
          onStepFinished?.(deliveredSummary);
        }
        return true;
      } catch (cause) {
        applyCompletionEvent({
          type: 'failed',
          retainUndo: lastAnswer.current?.retainOnCompletion === true,
        });
        notify(
          cause instanceof Error ? cause.message : 'Could not finish the study window.',
          'negative',
        );
        return false;
      } finally {
        completionPromise.current = null;
      }
    };
    completionPromise.current = commit();
    return completionPromise.current;
  }, [
    cardsRef,
    isSimpleMode,
    notify,
    onStepFinished,
    requestWindowId,
    revisionSessionRef,
    simpleSessionScope,
  ]);

  /** Settle completion produced by an answer, or allow exit when none is due. */
  const settleCompletion = useCallback(
    () =>
      pendingCompletion.current || completionPromise.current
        ? confirmCompletion()
        : Promise.resolve(true),
    [confirmCompletion],
  );

  const finaliseSummary = useCallback(
    (nextSummary: SessionSummary) => {
      if (!mountedRef.current) return;
      const effects = applyCompletionEvent({
        type: 'propose',
        summary: nextSummary,
        retainUndo: lastAnswer.current?.retainOnCompletion === true,
      });
      if (nextSummary.reachedGoal && effects.length > 0) setSchedulerProgress(1);
      for (const effect of effects) {
        if (effect === 'show-summary') {
          setSummary(nextSummary);
          setPhase('finished');
        } else if (effect === 'clear-undo') {
          lastAnswer.current = null;
          setCanUndo(false);
        } else if (effect === 'persist-completion') void confirmCompletion();
      }
    },
    [confirmCompletion],
  );

  const finish = useCallback(
    (
      reachedGoal: boolean,
      limitReached = false,
      timeLimitReached = false,
      dailyGoalReached = false,
      blockComplete = false,
    ) => {
      if (!mountedRef.current) return;
      const ctx = ctxRef.current;
      const total = distraction.sessionMs();
      const focus =
        total <= 0 ? 1 : Math.max(0, Math.min(1, (total - distraction.blurredMs()) / total));
      const masteryBefore = isSimpleMode ? 0 : progressBefore.current;
      const masteryAfter = isSimpleMode
        ? cardsRef.current.length > 0
          ? simpleMastered.current.size / cardsRef.current.length
          : 0
        : ctx
          ? cachedSessionProgress(cardsRef.current, ctx)
          : progressBefore.current;
      finaliseSummary({
        events: events.current,
        masteryBefore,
        masteryAfter,
        objectiveLabel: objectiveLabel(),
        focusFraction: focus,
        reachedGoal,
        limitReached,
        timeLimitReached,
        ...(dailyGoalReached ? { dailyGoalReached } : {}),
        ...(blockComplete ? { blockComplete } : {}),
        simpleMode: isSimpleMode,
        mode,
      });
    },
    [
      distraction,
      isSimpleMode,
      cardsRef,
      simpleMastered,
      cachedSessionProgress,
      finaliseSummary,
      events,
      objectiveLabel,
      mode,
    ],
  );

  useEffect(() => {
    if (
      plannedRevision &&
      revisionWindowBudgetSeconds > 0 &&
      revisionSecondsRemaining <= 0 &&
      phase !== 'loading' &&
      phase !== 'finished'
    ) {
      finish(false, false, true);
    }
  }, [finish, phase, plannedRevision, revisionSecondsRemaining, revisionWindowBudgetSeconds]);

  /** Present the next eligible card, or finish if the goal has been reached. */
  const serveNext = useCallback(() => {
    if (!mountedRef.current) return;
    // Keep studying starts a new pass after the previous report was committed.
    if (completionConfirmed.current) {
      finalising.current = false;
      completionConfirmed.current = false;
    }
    presentedAnswerInput.current = undefined;

    const effects = applySessionEventRef.current({
      type: 'next',
      selection: {
        simple: isSimpleMode,
        context: ctxRef.current,
        now: Date.now(),
        reviewLimit: requestReviewLimit,
        revisionPlan: revisionPlanRef.current,
        windowId: requestWindowId,
        windowStartedAt: revisionWindowStartedAt.current,
        performance: perfRef.current,
      },
    });
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist-resume':
          persistSimpleResume();
          break;
        case 'finish':
          finish(
            effect.stop[0],
            effect.stop[1],
            effect.stop[2],
            effect.stop[3],
            effect.blockComplete,
          );
          break;
        case 'present-card':
          setCurrent(effect.card);
          setPhase('question');
          onCardServedRef.current?.();
          setHintStep(0);
          pendingReviewEventId.current = null;
          advanceTimer({ type: 'start', now: performance.now() });
          distraction.beginCard();
          distraction.setAnswerVisible(false);
          if (effect.invalidateProgress) progressCacheRef.current.dirty = true;
          break;
      }
    }
  }, [finish, distraction, isSimpleMode, persistSimpleResume, requestWindowId, requestReviewLimit]);

  const continueStudying = useCallback(() => {
    if (summary?.simpleMode) {
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
    } else {
      const ctx = ctxRef.current;
      if (!ctx) return;
      events.current = [];
      progressBefore.current = cachedSessionProgress(cardsRef.current, ctx);
      setSummary(null);
      setLimitOverride(true);
      setTimeLimitOverride(true);
      serveNext();
    }
  }, [
    summary?.simpleMode,
    simpleMastered,
    simpleWrong,
    simpleQueue,
    createSimpleQueue,
    cardsRef,
    events,
    setSessionCardIds,
    resetSimpleSessionOutcomes,
    serveNext,
    cachedSessionProgress,
  ]);

  const preloadEnabled = enabled && (phase === 'question' || phase === 'answer');
  useEffect(() => {
    if (!preloadEnabled || !current) return;
    let stopPreloading: (() => void) | undefined;
    let timeout: number | undefined;
    // Let the current face paint before speculative reads and decoding begin.
    const frame = window.requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        const pool = isSimpleMode
          ? simpleQueue.current.filter((card) => !simpleMastered.current.has(card.id))
          : cardsRef.current;
        const upcoming = sessionPreloadCards(
          pool,
          current.id,
          isSimpleMode ? null : ctxRef.current,
          cooldowns.current,
        );
        stopPreloading = preloadSessionImages(upcoming, occlusionMapRef.current);
      }, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      stopPreloading?.();
    };
  }, [current, preloadEnabled, isSimpleMode, simpleQueue, cardsRef, cooldowns, simpleMastered]);

  // Stable ref so the initial-load effect never re-runs just because serveNext's
  // callback identity changed (which would reset phase and undo reveal/exit).
  const serveNextRef = useRef(serveNext);
  serveNextRef.current = serveNext;

  const continueFromNotes = useCallback(async (): Promise<void> => {
    if (lessonId && cardsRef.current.length === 0 && !lessonHasMembersRef.current) {
      await markLessonComplete(lessonId);
      setLessonNotesScreen(null);
      finish(true);
      return;
    }
    setLessonNotesScreen(null);
    serveNextRef.current();
  }, [cardsRef, finish, lessonId]);

  const finaliseSummaryRef = useRef(finaliseSummary);
  finaliseSummaryRef.current = finaliseSummary;

  // Load when the session identity changes — course, lesson, practice node,
  // filters, or assessment window. Serialised scope and filter keys mean a
  // parent passing a new array of the same ids does not restart the session.
  // Genuine navigation still resets session-local state first so the previous
  // queue cannot leak.
  useEffect(() => {
    let cancelled = false;
    // Reset all session refs so navigating deck -> deck does not leave stale state.
    cooldowns.current = new Map();
    events.current = [];
    lastAnswer.current = null;
    submitting.current = false;
    finalising.current = false;
    pendingCompletion.current = null;
    completionConfirmed.current = false;
    progressBefore.current = 0;
    progressCacheRef.current = { dirty: true, value: 0 };
    perfRef.current = new Map();
    schedulingUnitsRef.current = new Map();
    schedulingConfigRef.current = null;
    ctxRef.current = null;
    cardsRef.current = [];
    linesModeMapRef.current = new Map();
    occlusionMapRef.current = new Map();
    lessonExposureIdRef.current = null;
    lessonHasMembersRef.current = false;
    practiceSessionRef.current = null;
    revisionPlanRef.current = null;
    revisionInitialRevision.current = 0;
    revisionWindowStartedAt.current = 0;
    revisionSessionRef.current = createRevisionSessionState();
    reviewsByDeck.current = new Map();
    reviewsDayStart.current = 0;
    setCanUndo(false);
    setSummary(null);
    setEditing(false);
    onSessionResetRef.current?.();
    setSessionCardIds([]);
    sessionCardOutcomesRef.current = new Map();
    setSessionCardOutcomes(sessionCardOutcomesRef.current);
    setSchedulerProgress(0);
    setRevisionSecondsRemaining(0);
    setRevisionWindowBudgetSeconds(0);
    setRevisionNextWindowDay(undefined);
    setLimitOverride(false);
    setTimeLimitOverride(false);
    sessionStartMs.current = 0;
    setPhase('loading');
    reviewKindRef.current = 'scheduling-unit';
    ratchetCourseIdRef.current = null;
    ratchetLessonIdRef.current = null;
    setUnitDisplayName(null);
    setResolvedCourseId(null);
    setLessonNotesScreen(null);
    if (!enabled) return;
    void (async () => {
      const measureStartup =
        performance.getEntriesByName('lacuna:measure-study-startup').length > 0;
      const markLoad = (stage: string) => {
        if (measureStartup) performance.mark(`lacuna:study-load:${stage}`);
      };
      markLoad('load-start');
      const source = await loadSessionSource({
        lessonId,
        courseId,
        standaloneSimple,
        requestScopeLessonIds,
        requestSpecificationPointId,
        practiceNodeKeyParam,
        requestAssessmentId,
        filterParams,
        earlyReview,
        examPractice,
        catchUpPractice,
        plannedRevision,
        requestPlanId,
        requestWindowId,
        requestMilestoneLessonIds,
      });
      if (cancelled) return;
      if ('redirect' in source) {
        if (onFlowExit) onFlowExit();
        else void navigate(source.redirect);
        return;
      }
      setResolvedCourseId(source.resolvedCourseId);
      lessonHasMembersRef.current = source.lessonHasMembers;
      reviewKindRef.current = source.reviewKind;
      ratchetCourseIdRef.current = source.ratchetCourseId;
      ratchetLessonIdRef.current = source.ratchetLessonId;
      lessonExposureIdRef.current = source.lessonExposureId;
      setUnitDisplayName(source.unitDisplayName);
      revisionPlanRef.current = source.revisionPlan;
      revisionInitialRevision.current = source.revisionInitialRevision;
      revisionWindowStartedAt.current = source.revisionWindowStartedAt;
      setRevisionWindowBudgetSeconds(source.revisionWindowBudgetSeconds);
      setRevisionSecondsRemaining(source.revisionSecondsRemaining);
      setRevisionNextWindowDay(source.revisionNextWindowDay);
      practiceSessionRef.current = source.practiceSession;
      if (cancelled) return;

      markLoad('pool-ready');
      const data = await loadSessionData({
        source,
        tagFilter,
        filterParams,
        lessonId,
        plannedRevision,
        isSimpleMode,
        isGlobal,
        mode,
        simpleSessionScope,
        markLoad,
      });
      if (cancelled) return;
      cardsRef.current = data.cards;
      perfRef.current = data.performance;
      schedulingUnitsRef.current = data.schedulingUnits;
      schedulingConfigRef.current = data.schedulingConfig;
      ctxRef.current = data.context;
      answerModeLessonsRef.current = data.answerModeLessons;
      linesModeMapRef.current = data.linesMode;
      occlusionMapRef.current = data.occlusions;
      progressBefore.current = data.progressBefore;
      setSchedulerProgress(data.schedulerProgress);
      reviewsDayStart.current = data.reviewsDayStart;
      reviewsByDeck.current = data.reviewsByDeck;
      setLimitOverride(false);
      setSingleDeck((previous) => {
        const next = !isGlobal ? source.units[0] : null;
        return previous?.id === next?.id ? previous : next;
      });
      if (data.simple) {
        simpleQueue.current = data.simple.queue;
        simpleMastered.current = data.simple.mastered;
        simpleWrong.current = data.simple.wrong;
        events.current = data.simple.events;
        simpleRecitations.current = data.simple.recitations;
      }
      sessionCardOutcomesRef.current = data.simple?.outcomes ?? new Map();
      setSessionCardOutcomes(sessionCardOutcomesRef.current);
      setSessionCardIds((data.simple?.queue ?? data.cards).map((card) => card.id));
      if (data.entry.type === 'notes') {
        setLessonNotesScreen(data.entry.screen);
        setPhase('notes');
      } else if (data.entry.type === 'summary') {
        finaliseSummaryRef.current(data.entry.summary);
      } else {
        if (!source.firstStudyLessonId || !source.firstStudyLessonName) {
          markLoad('serve-start');
          sessionStartMs.current = revisionWindowStartedAt.current || Date.now();
        }
        serveNextRef.current();
        if (!source.firstStudyLessonId || !source.firstStudyLessonName) markLoad('serve-end');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The effect depends on session identity, not object identity, so the
    // serialised keys are the triggers. The arrays are read for their values
    // only; their content changing always changes the key, so the closure
    // cannot go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    courseId,
    lessonId,
    tagFilter,
    filterParamsKey,
    navigate,
    onFlowExit,
    isSimpleMode,
    mode,
    isGlobal,
    standaloneSimple,
    earlyReview,
    examPractice,
    catchUpPractice,
    practiceNodeKeyParam,
    requestScopeLessonIdsKey,
    requestSpecificationPointId,
    requestMilestoneLessonIdsKey,
    requestAssessmentId,
    requestPlanId,
    requestWindowId,
    plannedRevision,
    simpleSessionScope,
    createSimpleQueue,
  ]);

  const reveal = useCallback(() => {
    setPhase((p) => {
      if (p !== 'question') return p;
      const card = currentRef.current;
      if (card) {
        presentedAnswerInput.current = reviewAnswerInput(
          card,
          recitationSequence !== null,
          isTypingCard,
        );
      }
      advanceTimer({ type: 'reveal', now: performance.now() });
      return 'answer';
    });
    distraction.setAnswerVisible(true);
  }, [distraction, isTypingCard, recitationSequence]);

  /** Reveal a scheduled recitation, timing it per recited line for calibration. */
  const revealRecitation = useCallback(
    (lines: number) => {
      if (phaseRef.current !== 'question') return;
      presentedAnswerInput.current = undefined;
      advanceTimer({ type: 'reveal', now: performance.now(), lines });
      setPhase('answer');
      distraction.setAnswerVisible(true);
    },
    [distraction],
  );

  const hide = useCallback(() => {
    setPhase((p) => {
      if (p !== 'answer') return p;
      return 'question';
    });
    distraction.setAnswerVisible(false);
  }, [distraction]);

  /**
   * The unit an answer is recorded against. Global sessions key units by the card's
   * explicit schedulingUnitId; course and lesson scope use their sole resolved unit.
   */
  const {
    answerSimple,
    recitationMasteredItemIds,
    saveRecitationStep,
    answerRecitation,
    answerScheduled,
    undoLast,
  } = createSessionAnswerEffects({
    isGlobal,
    schedulingUnitsRef,
    perfRef,
    hintStepRef,
    readSessionStateRef,
    pendingReviewEventId,
    reviewSessionIdRef,
    reviewSessionKind,
    reviewKindRef,
    lessonExposureIdRef,
    lastAnswer,
    reviewsByDeck,
    setCanUndo,
    applySessionEventRef,
    persistSimpleResume,
    finish,
    serveNext,
    simpleQueue,
    simpleMastered,
    simpleWrong,
    setSessionCardOutcomes,
    linesModeMapRef,
    isSimpleMode,
    simpleRecitations,
    recitationSequence,
    events,
    ctxRef,
    schedulingConfigRef,
    submitting,
    revisionPlanRef,
    requestWindowId,
    revisionWindowStartedAt,
    cardsRef,
    setSchedulerProgress,
    sessionCardOutcomesRef,
    reviewsDayStart,
    progressCacheRef,
    practiceSessionRef,
    sessionStartMs,
    pendingCompletion,
    persistPracticeMilestone,
    limitOverride,
    timeLimitOverride,
    completionPromise,
    mountedRef,
    applyCompletionEvent,
    setSummary,
    setCurrent,
    setPhase,
    onCardServedRef,
    setHintStep,
    timerStart,
    distraction,
    responseTime,
    presentedAnswerInput,
    notify,
  });

  const answer = useCallback(
    async (
      input: AnswerInput,
      options?: {
        markedBy?: JevMarkProvenance;
        /** Automatic typed verdicts retain Undo through the final report. */
        retainUndo?: boolean;
      },
    ): Promise<AnswerResult> => {
      if (submitting.current) return { undoAvailable: false };
      submitting.current = true;
      const phaseNow = phaseRef.current;
      const cardNow = currentRef.current;
      const machineMarked = typeof input === 'object' ? input : null;
      if (
        (!machineMarked && phaseNow !== 'answer') ||
        (machineMarked && phaseNow !== 'question') ||
        !cardNow ||
        isUnrenderableItemPayload(cardNow)
      ) {
        submitting.current = false;
        return { undoAvailable: false };
      }

      try {
        const response: AnswerResponse = {
          retainUndo: options?.retainUndo ?? false,
          input: reviewAnswerInput(
            cardNow,
            recitationSequence !== null,
            presentedAnswerInput.current === 'typed',
          ),
          markedBy: options?.markedBy,
          correct: answerCorrect(input),
          manualGrade: typeof input === 'number' ? input : null,
          machineMarked,
          t: machineMarked ? (performance.now() - timerStart.current) / 1000 : responseTime.current,
          distracted: distraction.wasDistracted(),
        };
        return isSimpleMode
          ? await answerSimple(cardNow, response)
          : await answerScheduled(cardNow, response);
      } finally {
        submitting.current = false;
      }
    },
    [distraction, isSimpleMode, answerSimple, answerScheduled, recitationSequence],
  );

  /** Drop the current card from the live pool after a suspend/bury, then move on. */
  const afterRemoval = useCallback(
    (updated: Card) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (!mountedRef.current) return;
      setCanUndo(false);
      lastAnswer.current = null;
      applySessionEventRef.current({ type: 'remove-card', card: updated, simple: isSimpleMode });
      progressCacheRef.current.dirty = true;
      setSchedulerProgress(
        sessionCompletionProgress(cardsRef.current, ctx, sessionCardOutcomesRef.current),
      );
      const hasRemainingCards = isSimpleMode
        ? simpleQueue.current.some((card) => !simpleMastered.current.has(card.id))
        : sessionServePool(cardsRef.current, ctx).length > 0;
      if (!hasRemainingCards) {
        finish(false);
        return;
      }
      serveNext();
    },
    [
      cardsRef,
      finish,
      isSimpleMode,
      serveNext,
      sessionCardOutcomesRef,
      simpleMastered,
      simpleQueue,
    ],
  );

  const suspendCurrent = useCallback(async () => {
    if (!current) return;
    try {
      await suspendCard(current.id);
      afterRemoval({ ...current, suspended: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not suspend the card.', 'negative');
    }
  }, [current, afterRemoval, notify]);

  const buryCurrent = useCallback(async () => {
    if (!current) return;
    try {
      const until = startOfDay(Date.now()) + MS_PER_DAY;
      await buryCard(current.id, until);
      afterRemoval({ ...current, buriedUntil: until });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not bury the card.', 'negative');
    }
  }, [current, afterRemoval, notify]);

  /** Open the in-session editor, pausing the response timer while it is open. */
  const openEdit = useCallback(() => {
    if (!current) return;
    // Guard against the card having been removed from the session pool
    // (deleted / suspended by another tab) since the last render.
    if (!cardsRef.current.some((c) => c.id === current.id)) return;
    // Only the question phase has a running timer; the answer phase already
    // captured responseTime at reveal, so there is nothing to pause there.
    if (phase === 'question') {
      advanceTimer({ type: 'pause', now: performance.now() });
    }
    setEditing(true);
  }, [cardsRef, current, phase]);

  /** Rebase the timer so editing time is excluded, then leave the overlay. */
  const resumeAfterEdit = useCallback(() => {
    if (phase === 'question') {
      advanceTimer({ type: 'resume', now: performance.now() });
    }
  }, [phase]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    resumeAfterEdit();
  }, [resumeAfterEdit]);

  const handleEdited = useCallback(
    (updated: Card) => {
      applySessionEventRef.current({ type: 'replace-card', card: updated });
      setCurrent(updated);
      setEditing(false);
      resumeAfterEdit();
    },
    [resumeAfterEdit],
  );

  /** Flag or unflag the current card without disturbing its review timer or place. */
  const toggleFlagCurrent = useCallback(async () => {
    if (!current) return;
    try {
      const next = !current.flagged;
      await setCardFlag(current.id, next);
      const updated = { ...current, flagged: next };
      applySessionEventRef.current({ type: 'replace-card', card: updated });
      setCurrent(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the card flag.', 'negative');
    }
  }, [current, notify]);

  const editTagSuggestions =
    editing && current
      ? [
          ...new Set(
            cardsRef.current
              .filter((c) => c.schedulingUnitId === current.schedulingUnitId)
              .flatMap((c) => c.tags ?? []),
          ),
        ].sort()
      : [];

  return {
    phase,
    singleDeck,
    unitDisplayName,
    lessonNotesScreen,
    continueFromNotes,
    current,
    hintStep,
    setHintStep,
    isTypingCard,
    presentedAnswerInput: presentedAnswerInput.current,
    isMachineMarkedCard,
    hasUnrenderableItemPayload,
    isLinesModeCard,
    recitationSequence,
    recitationMasteredItemIds,
    savedRecitationStep: (sequenceId: string) => simpleRecitations.current.get(sequenceId),
    saveRecitationStep,
    currentCardIds,
    setRecitationFocus,
    answerRecitation,
    revealRecitation,
    occlusion: currentOcclusionData?.occlusion,
    occlusionAnswerText: currentOcclusionData?.answerText,
    summary,
    canUndo,
    editing,
    editTagSuggestions,
    sessionCardIds,
    sessionCardOutcomes,
    schedulerProgress,
    predictedRecall:
      !isSimpleMode && !plannedRevision && ctxRef.current
        ? cachedSessionProgress(cardsRef.current, ctxRef.current)
        : 0,
    simpleProgress,
    revisionSecondsRemaining,
    revisionWindowBudgetSeconds,
    revisionNextWindowDay,
    backOut,
    continueStudying,
    reveal,
    hide,
    answer,
    undoLast,
    confirmCompletion,
    settleCompletion,
    openEdit,
    cancelEdit,
    handleEdited,
    toggleFlagCurrent,
    suspendCurrent,
    buryCurrent,
    persistSimpleResume,
  };
}
