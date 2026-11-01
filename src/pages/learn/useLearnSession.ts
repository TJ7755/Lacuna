import { loadSessionSource } from './loadSessionSource';
import type { JevMarkProvenance } from '../../jev/types';
import { useLeaveFlowWith } from '../../utils/editorOrigin';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { db, makeId } from '../../db/schema';
import { pauseAssetGc } from '../../db/assets';
import { performanceForReviewUnits } from '../../db/backingDecks';
import { dailyReviewCounts } from '../../db/reviewHistoryRead';
import type {
  Card,
  Grade,
  Lesson,
  LessonCardExposure,
  Sequence,
  ReviewSessionKind,
  RevisionPlan,
  SchedulerConfig,
  UserPerformance,
} from '../../db/types';
import { buryCard, setCardFlag, suspendCard } from '../../db/cardRepository';
import { markLessonComplete, upsertLessonCardExposure } from '../../db/lessonRepository';
import { listNotes } from '../../db/noteRepository';
import { emptyPerformance } from '../../fsrs/grading';
import type { CooldownMap } from '../../fsrs/cooldown';
import { progressHeading } from '../../fsrs/objective';
import {
  makeSessionContext,
  sessionComplete,
  sessionCompletionProgress,
  sessionProgress,
  sessionServePool,
} from '../../fsrs/session';
import type { SessionContext } from '../../fsrs/session';
import { startOfDay } from '../../utils/datetime';
import { MS_PER_DAY } from '../../fsrs/params';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { SessionCardOutcome, SessionEvent, SessionSummary } from '../../course/sessionSummary';
import type { useToast } from '../../components/ui/Toast';
import { linesModeSequencesByCard } from '../../db/linesModeCards';
import { isLabelCardId } from '../../db/sequenceGeneration';
import { occlusionDataByCard, type OcclusionCardData } from '../../db/occlusionStudy';
import { filterSessionCardPool } from '../../db/search';
import type { CardFilter } from '../../db/search';
import { FILTER_LABELS } from './types';
import type {
  LearnModeType,
  LessonNotesScreen,
  Phase,
  MachineMarkedAnswer,
  StudyUnit,
} from './types';
import { hasMachineMarkedPayload, isUnrenderableItemPayload } from './sessionCardCapabilities';
import { clearSimpleSession, saveSimpleSession } from './simpleSessionPersistence';
import { useAnswerInput } from '../../state/answerInput';
import { resolveAnswerMode, reviewAnswerInput } from '../../utils/resolveAnswerMode';
import { shuffledSimpleQueue } from './recitation/recitationFlow';
import { preloadSessionImages, sessionPreloadCards } from './sessionPreload';
import { prepareSimpleSessionQueue } from './sessionPool';
import { resolveLearnSessionScope } from './sessionScope';
import {
  persistRecitationReview,
  persistSimpleSessionAnswer,
  undoSessionAnswer,
  type AnswerSnapshot,
} from './sessionAnswerPersistence';
import {
  persistSessionCompletion,
  persistSessionPracticeMilestone,
  type PracticeSession,
} from './sessionCompletionPersistence';
import {
  transitionSession,
  afterScheduledAnswer,
  snapshotSession,
  transitionResponseTimer,
  transitionCompletion,
  type CompletionEvent,
  type SessionState,
  type SessionEventInput,
} from './sessionMachine';
import {
  createRevisionSessionState,
  snapshotRevisionSessionState,
} from '../../course/revisionSession';
import {
  answerCorrect,
  answerFeedback,
  answerGrade,
  persistAnswer,
  type AnswerInput,
  type AnswerResult,
} from './answerSteps';

/** One submitted answer, as the grading paths need it. */
interface AnswerResponse {
  retainUndo: boolean;
  input?: 'typed' | 'reveal';
  markedBy?: JevMarkProvenance;
  correct: boolean;
  manualGrade: Grade | null;
  machineMarked: MachineMarkedAnswer | null;
  /** Response time in seconds. */
  t: number;
  distracted: boolean;
}

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
  const simpleQueue = useRef<Card[]>([]);
  const simpleMastered = useRef<Set<string>>(new Set());
  const simpleWrong = useRef<Set<string>>(new Set());
  // Simple mode: in-progress recitation steps by sequence id, saved with the session.
  const simpleRecitations = useRef<Map<string, unknown>>(new Map());
  const [sessionCardIds, renderSessionCardIds] = useState<string[]>([]);
  const sessionCardIdsRef = useRef<string[]>([]);
  const setSessionCardIds = useCallback((value: string[] | ((previous: string[]) => string[])) => {
    const next = typeof value === 'function' ? value(sessionCardIdsRef.current) : value;
    sessionCardIdsRef.current = next;
    renderSessionCardIds(next);
  }, []);
  const [sessionCardOutcomes, setSessionCardOutcomes] = useState<Map<string, SessionCardOutcome>>(
    () => new Map(),
  );
  const sessionCardOutcomesRef = useRef(sessionCardOutcomes);
  sessionCardOutcomesRef.current = sessionCardOutcomes;
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
  const cooldowns = useRef<CooldownMap>(new Map());
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
  const cardsRef = useRef<Card[]>([]);
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
  }, [current, recitationSequence, isSimpleMode, recitationFocus]);
  const lessonExposureIdRef = useRef<string | null>(null);
  const lessonHasMembersRef = useRef(false);
  const practiceSessionRef = useRef<PracticeSession | null>(null);
  const revisionPlanRef = useRef<RevisionPlan | null>(null);
  const revisionInitialRevision = useRef(0);
  const revisionWindowStartedAt = useRef(0);
  const revisionSessionRef = useRef(createRevisionSessionState());
  const timerStart = useRef(0);
  const responseTime = useRef(0);
  // Elapsed thinking time captured when the edit overlay opens during the question
  // phase, so the timer can be rebased (not reset) when the overlay closes.
  const pausedElapsed = useRef(0);
  const events = useRef<SessionEvent[]>([]);
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
  const readSessionState = (): SessionState => ({
    cards: cardsRef.current,
    cardIds: sessionCardIdsRef.current,
    simple: {
      queue: simpleQueue.current,
      mastered: simpleMastered.current,
      wrong: simpleWrong.current,
      outcomes: sessionCardOutcomesRef.current,
    },
    outcomes: sessionCardOutcomesRef.current,
    events: events.current,
    cooldowns: cooldowns.current,
    revision: revisionSessionRef.current,
  });
  const applySessionEvent = (event: SessionEventInput) => {
    const transition = transitionSession(readSessionState(), event);
    const next = transition.state;
    cardsRef.current = next.cards;
    simpleQueue.current = next.simple.queue;
    simpleMastered.current = next.simple.mastered;
    simpleWrong.current = next.simple.wrong;
    cooldowns.current = next.cooldowns;
    revisionSessionRef.current = next.revision;
    events.current = next.events;
    sessionCardOutcomesRef.current = next.outcomes;
    setSessionCardOutcomes(next.outcomes);
    setSessionCardIds(next.cardIds);
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
    [isSimpleMode, simpleSessionScope],
  );

  const resetSimpleSessionOutcomes = useCallback(() => {
    const outcomes = new Map<string, SessionCardOutcome>();
    sessionCardOutcomesRef.current = outcomes;
    setSessionCardOutcomes(outcomes);
  }, []);

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
  }, [isSimpleMode, notify, onStepFinished, requestWindowId, simpleSessionScope]);

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
    [objectiveLabel, distraction, cachedSessionProgress, isSimpleMode, mode, finaliseSummary],
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
    cachedSessionProgress,
    createSimpleQueue,
    resetSimpleSessionOutcomes,
    serveNext,
    summary?.simpleMode,
    setSessionCardIds,
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
  }, [current, preloadEnabled, isSimpleMode]);

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
  }, [finish, lessonId]);

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
      const { units, sessionUnits, firstStudyLessonId, firstStudyLessonName } = source;
      let { cards } = source;
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
      cards = filterSessionCardPool(cards, { tag: tagFilter, filters: filterParams });

      if (isSimpleMode) {
        const now = Date.now();
        cards = cards.filter(
          (card) => !card.suspended && !(card.buriedUntil && card.buriedUntil > now),
        );
      }

      const perfs = await performanceForReviewUnits(
        units.map((unit) => unit.id),
        reviewKindRef.current,
      );
      const perfMap = new Map<string, UserPerformance>();
      units.forEach((u, i) => perfMap.set(u.id, perfs[i] ?? emptyPerformance(u.id)));
      perfRef.current = perfMap;
      schedulingUnitsRef.current = new Map(units.map((u) => [u.id, u]));
      schedulingConfigRef.current =
        sessionUnits.length === 1 && 'config' in sessionUnits[0] ? sessionUnits[0].config : null;
      const ctx = makeSessionContext(
        sessionUnits,
        !plannedRevision && !isSimpleMode && filterParams.includes('due') ? 'due' : 'objective',
        plannedRevision || isSimpleMode ? undefined : cards,
      );
      markLoad('context-ready');
      ctxRef.current = ctx;
      cardsRef.current = cards;
      const answerLessonIds = [
        ...new Set(cards.flatMap((card) => (card.primaryLessonId ? [card.primaryLessonId] : []))),
      ];
      if (lessonId && !answerLessonIds.includes(lessonId)) answerLessonIds.push(lessonId);
      const answerLessons = await db.lessons.bulkGet(answerLessonIds);
      answerModeLessonsRef.current = new Map(
        answerLessons.flatMap((lesson) => (lesson ? [[lesson.id, lesson]] : [])),
      );
      try {
        linesModeMapRef.current = await linesModeSequencesByCard(cards);
      } catch {
        // Line-specific prompts and hints are non-critical; a failed lookup disables them.
      }
      try {
        occlusionMapRef.current = await occlusionDataByCard(cards);
      } catch {
        // Diagram rendering and typed mode are non-critical to a session's grading path;
        // a failed lookup leaves occlusion cards on their plain-text fallback.
      }
      if (cancelled) return;
      markLoad('metadata-ready');
      const initialProgress = sessionProgress(cards, ctx);
      const serveableCards = plannedRevision || isSimpleMode ? cards : sessionServePool(cards, ctx);
      const hasServeableCards = serveableCards.length > 0;
      setSchedulerProgress(sessionCompletionProgress(cards, ctx, sessionCardOutcomesRef.current));
      if (!isSimpleMode) setSessionCardIds(cards.map((card) => card.id));
      sessionCardOutcomesRef.current = new Map();
      setSessionCardOutcomes(sessionCardOutcomesRef.current);
      if (!isSimpleMode) {
        const reviewNow = Date.now();
        reviewsDayStart.current = startOfDay(reviewNow);
        reviewsByDeck.current = await dailyReviewCounts(reviewKindRef.current, reviewNow);
        if (cancelled) return;
      }
      markLoad('progress-ready');
      setLimitOverride(false);
      setSingleDeck((prev) => {
        const next = !isGlobal ? units[0] : null;
        if (prev?.id === next?.id) return prev;
        return next;
      });

      if (isSimpleMode) {
        const prepared = prepareSimpleSessionQueue(cards, simpleSessionScope, createSimpleQueue);
        simpleQueue.current = prepared.queue;
        setSessionCardIds(simpleQueue.current.map((card) => card.id));
        simpleMastered.current = prepared.mastered;
        simpleWrong.current = prepared.wrong;
        events.current = prepared.events;
        simpleRecitations.current = prepared.recitations;
        sessionCardOutcomesRef.current = prepared.outcomes;
        setSessionCardOutcomes(sessionCardOutcomesRef.current);
      }

      // A lesson always opens with its notes, including a cardless lesson. The
      // Continue action owns cardless completion; card sessions continue into
      // the Simple-mode queue below.
      if (firstStudyLessonId && firstStudyLessonName) {
        const lessonNotes = await listNotes(firstStudyLessonId);
        if (cancelled) return;
        // Nothing to read: start the cards rather than show an empty page to dismiss.
        if (lessonNotes.length === 0 && cards.length > 0) {
          serveNextRef.current();
          return;
        }
        setLessonNotesScreen({ lessonName: firstStudyLessonName, notes: lessonNotes });
        setPhase('notes');
        return;
      }

      if (units.length === 0 || !hasServeableCards) {
        if (cancelled) return;
        const isFiltered = filterParams.length > 0 || tagFilter !== null;
        const practiceAlreadySecured =
          !isFiltered &&
          (practiceSessionRef.current?.scopeCards.length ?? 0) > 0 &&
          cards.length === 0;
        // Show an empty-state screen instead of navigating away so the user
        // understands what happened and can choose what to do next.
        const reportProgress = isFiltered ? 0 : initialProgress;
        progressBefore.current = reportProgress;
        const filterParts = [
          ...(tagFilter ? [`tag "${tagFilter}"`] : []),
          ...(filterParams.length > 0 ? filterParams.map((f) => FILTER_LABELS[f] ?? f) : []),
        ];
        const filterLabel = filterParts.join(' and ');
        const filteredCardsUnavailable = isFiltered && cards.length > 0;
        finaliseSummaryRef.current({
          events: [],
          masteryBefore: reportProgress,
          masteryAfter: reportProgress,
          objectiveLabel: isFiltered
            ? filteredCardsUnavailable
              ? `No eligible cards matching ${filterLabel} to study`
              : `No cards matching ${filterLabel} to study`
            : !isGlobal
              ? cards.length > 0
                ? 'No cards are currently eligible to study'
                : progressHeading(units[0])
              : cards.length > 0
                ? 'No cards are currently eligible to study'
                : 'Predicted readiness across all courses',
          focusFraction: 1,
          reachedGoal: practiceAlreadySecured,
          limitReached: false,
          mode,
        });
        return;
      }

      progressBefore.current = initialProgress;
      if (!isSimpleMode) {
        const cardUnitIds = new Set(serveableCards.map((card) => card.schedulingUnitId));
        const activeUnits = isGlobal ? units.filter((unit) => cardUnitIds.has(unit.id)) : units;
        const hasReached = (setting: 'maxReviewsPerDay' | 'dailyReviewGoal') =>
          activeUnits.some((unit) => {
            const config = isGlobal ? unit : schedulingConfigRef.current;
            const threshold = config?.[setting];
            return Boolean(threshold && (reviewsByDeck.current.get(unit.id) ?? 0) >= threshold);
          });
        const limitReached = hasReached('maxReviewsPerDay');
        const goalReached = hasReached('dailyReviewGoal');
        if (limitReached || goalReached) {
          finaliseSummaryRef.current({
            events: [],
            masteryBefore: initialProgress,
            masteryAfter: initialProgress,
            objectiveLabel: isGlobal
              ? 'Predicted readiness across all courses'
              : progressHeading(units[0]),
            focusFraction: 1,
            reachedGoal: !limitReached && goalReached,
            limitReached,
            mode,
          });
          return;
        }
      }
      if (!plannedRevision && !isSimpleMode && sessionComplete(cards, ctx)) {
        finaliseSummaryRef.current({
          events: [],
          masteryBefore: progressBefore.current,
          masteryAfter: progressBefore.current,
          objectiveLabel: !isGlobal
            ? progressHeading(units[0])
            : 'Predicted readiness across all courses',
          focusFraction: 1,
          reachedGoal: true,
          limitReached: false,
          timeLimitReached: false,
          mode,
        });
      } else {
        markLoad('serve-start');
        sessionStartMs.current = revisionWindowStartedAt.current || Date.now();
        serveNextRef.current();
        markLoad('serve-end');
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
  const answerUnit = useCallback(
    (card: Card): StudyUnit | undefined =>
      isGlobal
        ? card.schedulingUnitId
          ? schedulingUnitsRef.current.get(card.schedulingUnitId)
          : undefined
        : schedulingUnitsRef.current.values().next().value,
    [isGlobal],
  );

  /** Grade and record a Simple-mode answer, then advance the pass. */
  const answerSimple = useCallback(
    async (
      cardNow: Card,
      { correct, machineMarked, t, distracted, markedBy, retainUndo, input }: AnswerResponse,
    ): Promise<AnswerResult> => {
      const deck = answerUnit(cardNow);
      if (!deck) return { undoAvailable: false };
      const perf = perfRef.current.get(deck.id);
      const hintUsed = hintStepRef.current > 0;
      // The controls stay binary, while the invisible grade uses the same
      // timing, calibration and hint rules as Practice. Machine-marked cards
      // retain their mark-aware grade.
      const grade = answerGrade({
        machineMarked,
        manualGrade: null,
        correct,
        responseTimeSec: t,
        hintUsed,
        performance: perf,
      });

      const simpleSnapshot = {
        queue: [...simpleQueue.current],
        mastered: new Set(simpleMastered.current),
        wrong: new Set(simpleWrong.current),
        cardIds: [...sessionCardIds],
        exposureAdded: null as LessonCardExposure | null,
      };
      const machineSnapshot = snapshotSession(readSessionStateRef.current());
      const eventsLen = events.current.length;
      const outcomeBefore = sessionCardOutcomesRef.current.get(cardNow.id);
      const eventId = pendingReviewEventId.current ?? makeId();
      pendingReviewEventId.current = eventId;
      const { result, nextPerf, perfBefore, exposureAdded } = await persistSimpleSessionAnswer(
        deck.id,
        perf,
        () => ({
          card: cardNow,
          eventId,
          sessionId: reviewSessionIdRef.current,
          sessionKind: reviewSessionKind,
          deck,
          kind: reviewKindRef.current,
          grade,
          responseTimeSec: t,
          distracted,
          hintUsed,
          correct,
          marksEarned: machineMarked?.marksEarned,
          marksAvailable: machineMarked?.marksAvailable,
          lineVerdicts: machineMarked?.lineVerdicts,
          checkerDisputes: machineMarked?.checkerDisputes,
          markedBy,
          input,
        }),
        () => lessonExposureIdRef.current,
      );
      simpleSnapshot.exposureAdded = exposureAdded;
      if (nextPerf) perfRef.current.set(deck.id, nextPerf);
      lastAnswer.current =
        result.recorded && retainUndo
          ? {
              machine: machineSnapshot,
              responseTimeSec: t,
              input,
              retainOnCompletion: true,
              undo: {
                eventId,
                cardBefore: result.cardBefore,
                perfBefore,
                sessionHistoryId: result.sessionHistoryId,
                deckId: deck.id,
                kind: result.kind,
                lastInteractedAtBefore: result.lastInteractedAtBefore,
                updatedAtBefore: result.updatedAtBefore,
                undoStateAfter: result.undoStateAfter,
              },
              cooldowns: new Map(cooldowns.current),
              eventsLen,
              deckId: deck.id,
              deckReviews: reviewsByDeck.current.get(deck.id) ?? 0,
              outcomeBefore,
              revision: snapshotRevisionSessionState(revisionSessionRef.current),
              simple: simpleSnapshot,
            }
          : null;
      setCanUndo(result.recorded && retainUndo);
      const effects = applySessionEventRef.current({
        type: 'simple-recorded',
        card: result.card,
        event: { cardId: cardNow.id, grade, correct, responseTimeSec: t, distracted },
      });
      pendingReviewEventId.current = null;
      for (const effect of effects) {
        switch (effect.type) {
          case 'persist-resume':
            persistSimpleResume();
            break;
          case 'finish':
            finish(...effect.stop);
            break;
          case 'serve-next':
            serveNext();
            break;
        }
      }
      return { undoAvailable: lastAnswer.current !== null };
    },
    [answerUnit, finish, persistSimpleResume, reviewSessionKind, serveNext, sessionCardIds],
  );

  /** Item ids of a sequence's lines already mastered this session (a resumed pass). */
  const recitationMasteredItemIds = useCallback(
    (sequenceId: string) =>
      new Set(
        simpleQueue.current.flatMap((card) =>
          card.sequenceItemId &&
          simpleMastered.current.has(card.id) &&
          linesModeMapRef.current.get(card.id)?.id === sequenceId
            ? [card.sequenceItemId]
            : [],
        ),
      ),
    [],
  );

  /**
   * Save a recitation's current step so leaving and returning resumes it. Null forgets a
   * finished one without saving: its final check has already saved the session, and
   * finishing the pass may have cleared it since.
   */
  const saveRecitationStep = useCallback(
    (sequenceId: string, state: unknown) => {
      if (!isSimpleMode) return;
      if (state === null) {
        simpleRecitations.current.delete(sequenceId);
        return;
      }
      simpleRecitations.current.set(sequenceId, state);
      persistSimpleResume();
    },
    [isSimpleMode, persistSimpleResume],
  );

  /**
   * Record one self-marked check of a cumulative recitation (Simple mode, lines-mode
   * sequences). Each queued line gets one review per session, on its first recall;
   * `masteredItemIds` completes those lines ('all' once the recitation is finished), and
   * the session moves on once the whole sequence is mastered.
   */
  const answerRecitation = useCallback(
    async (
      results: readonly { itemId: string; correct: boolean }[],
      responseTimeSec: number,
      masteredItemIds: readonly string[] | 'all',
    ) => {
      if (!recitationSequence || !isSimpleMode) return;
      const cards = new Map<string, Card>();
      for (const card of simpleQueue.current) {
        if (
          card.sequenceItemId &&
          !isLabelCardId(card.sequenceItemId) &&
          linesModeMapRef.current.get(card.id)?.id === recitationSequence.id
        ) {
          cards.set(card.sequenceItemId, card);
        }
      }
      for (const { itemId, correct } of results) {
        const card = cards.get(itemId);
        const deck = card && answerUnit(card);
        if (!card || !deck) continue;
        // The bar follows each manual check, including retries; scheduling still
        // records only the first recall and mastery waits for a completed chunk.
        applySessionEventRef.current({ type: 'recitation-check', cardId: card.id, correct });
        if (events.current.some((event) => event.cardId === card.id)) continue;
        const recorded = await persistRecitationReview({
          card,
          sessionId: reviewSessionIdRef.current,
          sessionKind: reviewSessionKind,
          deck,
          kind: reviewKindRef.current,
          responseTimeSec,
          correct,
        });
        applySessionEventRef.current({
          type: 'recitation-recorded',
          card: recorded.card,
          event: recorded.event,
        });
        cards.set(recorded.card.sequenceItemId!, recorded.card);
      }
      if (masteredItemIds === 'all') simpleRecitations.current.delete(recitationSequence.id);
      for (const itemId of masteredItemIds === 'all' ? [...cards.keys()] : masteredItemIds) {
        const card = cards.get(itemId);
        if (!card || simpleMastered.current.has(card.id)) continue;
        applySessionEventRef.current({ type: 'recitation-mastered', cardIds: [card.id] });
        if (lessonExposureIdRef.current) {
          await upsertLessonCardExposure(lessonExposureIdRef.current, card.id);
        }
      }
      persistSimpleResume();
      if ([...cards.values()].every((card) => simpleMastered.current.has(card.id))) serveNext();
    },
    [
      answerUnit,
      isSimpleMode,
      persistSimpleResume,
      recitationSequence,
      reviewSessionKind,
      serveNext,
    ],
  );

  /**
   * Grade and record a scheduled answer: persist it, update cooldowns, revision
   * bookkeeping and undo state, then stop the session or serve the next card.
   */
  const answerScheduled = useCallback(
    async (
      cardNow: Card,
      {
        correct,
        manualGrade,
        machineMarked,
        t,
        distracted,
        markedBy,
        retainUndo,
        input,
      }: AnswerResponse,
    ): Promise<AnswerResult> => {
      const ctx = ctxRef.current;
      const deck = answerUnit(cardNow);
      const schedulingConfig = isGlobal ? deck : schedulingConfigRef.current;
      if (!ctx || !deck || !schedulingConfig) {
        submitting.current = false;
        return { undoAvailable: false };
      }

      const perf = perfRef.current.get(deck.id);
      const hintUsed = hintStepRef.current > 0;
      const grade = answerGrade({
        machineMarked,
        manualGrade,
        correct,
        responseTimeSec: t,
        hintUsed,
        performance: perf,
      });

      const cooldownsSnapshot = new Map(cooldowns.current);
      const machineSnapshot = snapshotSession(readSessionStateRef.current());
      const eventsLen = events.current.length;
      const perfBefore = perf ?? null;
      const outcomeBefore = sessionCardOutcomes.get(cardNow.id);
      const eventId = pendingReviewEventId.current ?? makeId();
      const revisionSnapshot = snapshotRevisionSessionState(revisionSessionRef.current);
      pendingReviewEventId.current = eventId;

      const { result, performance: nextPerf } = await persistAnswer(
        {
          card: cardNow,
          eventId,
          sessionId: reviewSessionIdRef.current,
          sessionKind: reviewSessionKind,
          revisionPlanId: revisionPlanRef.current?.id,
          revisionWindowId: revisionPlanRef.current ? requestWindowId : undefined,
          deck,
          kind: reviewKindRef.current,
          grade,
          responseTimeSec: t,
          distracted,
          hintUsed,
          correct,
          marksEarned: machineMarked?.marksEarned,
          marksAvailable: machineMarked?.marksAvailable,
          lineVerdicts: machineMarked?.lineVerdicts,
          checkerDisputes: machineMarked?.checkerDisputes,
          markedBy,
          input,
        },
        deck.id,
        perf,
      );
      if (nextPerf) perfRef.current.set(deck.id, nextPerf);
      const {
        card: updated,
        cardBefore,
        recorded,
        sessionHistoryId,
        kind,
        lastInteractedAtBefore,
        updatedAtBefore,
        undoStateAfter,
      } = result;

      const revisionWindowForAnswer = revisionPlanRef.current?.windows.find(
        (candidate) => candidate.id === requestWindowId,
      );
      applySessionEventRef.current({
        type: 'scheduled-recorded',
        card: updated,
        event: { cardId: cardNow.id, grade, correct, responseTimeSec: t, distracted },
        eventId,
        recorded,
        deckId: deck.id,
        global: isGlobal,
        now: Date.now(),
        hasRevisionPlan: revisionPlanRef.current !== null,
        revisionWindowEndsAt:
          revisionPlanRef.current && requestWindowId
            ? revisionWindowForAnswer
              ? revisionWindowStartedAt.current + revisionWindowForAnswer.budgetMinutes * 60_000
              : Date.now()
            : undefined,
      });
      const nextCards = cardsRef.current;
      setSchedulerProgress(
        sessionCompletionProgress(nextCards, ctx, sessionCardOutcomesRef.current),
      );

      const reviewNow = Date.now();
      const reviewDayStart = startOfDay(reviewNow);
      if (reviewDayStart !== reviewsDayStart.current) {
        reviewsByDeck.current = await dailyReviewCounts(kind, reviewNow);
        reviewsDayStart.current = reviewDayStart;
      } else if (recorded) {
        reviewsByDeck.current.set(deck.id, (reviewsByDeck.current.get(deck.id) ?? 0) + 1);
      }
      const deckReviews = reviewsByDeck.current.get(deck.id) ?? 0;

      lastAnswer.current = recorded
        ? {
            machine: machineSnapshot,
            responseTimeSec: t,
            input,
            retainOnCompletion: retainUndo,
            undo: {
              eventId,
              cardBefore,
              perfBefore,
              sessionHistoryId,
              deckId: deck.id,
              kind,
              lastInteractedAtBefore,
              updatedAtBefore,
              undoStateAfter,
            },
            cooldowns: cooldownsSnapshot,
            eventsLen,
            deckId: deck.id,
            deckReviews,
            outcomeBefore,
            revision: revisionSnapshot,
          }
        : null;
      setCanUndo(recorded);
      // Course and lesson sessions hold a single unit; global sessions key
      // the context by scheduling-unit id (see makeSessionContext).
      const sessionDeck = isGlobal ? ctx.decks.get(deck.id) : ctx.decks.values().next().value;
      const answerResult = answerFeedback({
        recorded,
        grade,
        card: updated,
        deck: sessionDeck?.deck ?? deck,
        examDateContext: sessionDeck?.oc.examDateContext,
      });

      progressCacheRef.current.dirty = true;

      const revisionWindow = revisionPlanRef.current?.windows.find(
        (candidate) => candidate.id === requestWindowId,
      );
      const effects = afterScheduledAnswer(readSessionStateRef.current(), {
        revision: revisionPlanRef.current !== null,
        context: ctx,
        practice: practiceSessionRef.current !== null,
        deckReviews,
        maxReviewsPerDay: schedulingConfig.maxReviewsPerDay,
        dailyReviewGoal: schedulingConfig.dailyReviewGoal,
        sessionTimeLimitMinutes: schedulingConfig.sessionTimeLimitMinutes,
        limitOverride,
        timeLimitOverride,
        revisionWindowEndsAt: revisionWindow
          ? revisionWindowStartedAt.current + revisionWindow.budgetMinutes * 60_000
          : undefined,
        sessionStartMs: sessionStartMs.current,
        now: Date.now(),
      });
      for (const effect of effects) {
        if (effect.type === 'finish') finish(...effect.stop);
        else if (effect.type === 'serve-next') serveNext();
        else if (effect.type === 'persist-practice' && !pendingCompletion.current)
          await persistPracticeMilestone(nextCards, false);
      }
      return lastAnswer.current ? answerResult : { undoAvailable: false };
    },
    [
      answerUnit,
      finish,
      serveNext,
      limitOverride,
      timeLimitOverride,
      isGlobal,
      persistPracticeMilestone,
      sessionCardOutcomes,
      reviewSessionKind,
      requestWindowId,
    ],
  );

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

  const undoLast = useCallback(
    async (options?: { reveal?: boolean }) => {
      const snap = lastAnswer.current;
      const ctx = ctxRef.current;
      if (!snap || !ctx || submitting.current || completionPromise.current) return;
      submitting.current = true;
      try {
        await undoSessionAnswer(snap.undo, snap.simple?.exposureAdded);
        if (!mountedRef.current) return;
        applySessionEventRef.current({ type: 'restore', snapshot: snap.machine });
        setSchedulerProgress(
          sessionCompletionProgress(cardsRef.current, ctx, sessionCardOutcomesRef.current),
        );
        perfRef.current.set(snap.deckId, snap.undo.perfBefore ?? emptyPerformance(snap.deckId));
        if (snap.simple) persistSimpleResume();
        // Simple passes do not increment the scheduled daily review counter.
        const prevReviews = snap.deckReviews - (snap.simple ? 0 : 1);
        if (prevReviews > 0) reviewsByDeck.current.set(snap.deckId, prevReviews);
        else reviewsByDeck.current.delete(snap.deckId);
        applyCompletionEvent({ type: 'reset' });
        setSummary(null);
        lastAnswer.current = null;
        setCanUndo(false);
        progressCacheRef.current.dirty = true;
        setCurrent(snap.undo.cardBefore);
        setPhase(options?.reveal ? 'answer' : 'question');
        onCardServedRef.current?.();
        setHintStep(0);
        pendingReviewEventId.current = null;
        timerStart.current = performance.now();
        distraction.beginCard();
        responseTime.current = snap.responseTimeSec;
        presentedAnswerInput.current = snap.input;
        distraction.setAnswerVisible(options?.reveal === true);
        return snap.undo.cardBefore;
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Could not undo the last answer.', 'negative');
      } finally {
        submitting.current = false;
      }
    },
    [distraction, notify, persistSimpleResume],
  );

  /** Drop the current card from the live pool after a suspend/bury, then move on. */
  const afterRemoval = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!mountedRef.current) return;
    setCanUndo(false);
    lastAnswer.current = null;
    const removedId = currentRef.current?.id;
    if (removedId) applySessionEventRef.current({ type: 'remove-card', cardId: removedId });
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
  }, [finish, isSimpleMode, serveNext]);

  const suspendCurrent = useCallback(async () => {
    if (!current) return;
    try {
      await suspendCard(current.id);
      cardsRef.current = cardsRef.current.map((c) =>
        c.id === current.id ? { ...c, suspended: true } : c,
      );
      if (isSimpleMode) {
        simpleQueue.current = simpleQueue.current.filter((c) => c.id !== current.id);
      }
      afterRemoval();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not suspend the card.', 'negative');
    }
  }, [current, afterRemoval, notify, isSimpleMode]);

  const buryCurrent = useCallback(async () => {
    if (!current) return;
    try {
      const until = startOfDay(Date.now()) + MS_PER_DAY;
      await buryCard(current.id, until);
      cardsRef.current = cardsRef.current.map((c) =>
        c.id === current.id ? { ...c, buriedUntil: until } : c,
      );
      if (isSimpleMode) {
        simpleQueue.current = simpleQueue.current.filter((c) => c.id !== current.id);
      }
      afterRemoval();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not bury the card.', 'negative');
    }
  }, [current, afterRemoval, notify, isSimpleMode]);

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
  }, [current, phase]);

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
