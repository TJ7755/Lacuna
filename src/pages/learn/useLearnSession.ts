import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { db, makeId } from '../../db/schema';
import {
  getSchedulingUnit,
  performanceForCourseBackingDecks,
  performanceForReviewUnit,
  performanceForReviewUnits,
} from '../../db/backingDecks';
import { getCourse, listCourseAssessments } from '../../db/read';
import { hydrateCardsWithHistory } from '../../db/reviewHistoryRead';
import type {
  Card,
  Course,
  Grade,
  Lesson,
  Sequence,
  ReviewSessionKind,
  RevisionPlan,
  SchedulerConfig,
  SchedulingUnitRecord,
  UserPerformance,
} from '../../db/types';
import {
  buryCard,
  completeRevisionWindow,
  listNotes,
  ratchetLessonUnlock,
  recordReview,
  refreshRevisionPlan,
  savePracticeMilestoneProgress,
  setCardFlag,
  startRevisionWindow,
  suspendCard,
  undoReview,
  upsertLessonCardExposure,
} from '../../db/repository';
import type { ReviewUndo } from '../../db/repository';
import { nextLessonUnlockCondition } from '../../course/unlock';
import {
  buildPath,
  isLessonUnlocked,
  lessonEffectiveReleaseDates,
  manualPracticeGateOutcomeAfterLesson,
} from '../../course/path';
import {
  buildCourseStudyFlowSnapshot,
  courseMeanReviewSeconds,
} from '../../course/studyFlowSnapshot';
import {
  eligiblePracticePool,
  lessonCardMembership,
  lessonStudyPool,
  practiceCardScope,
  practiceReadiness,
  practiceScopeVersion,
} from '../../course/studyPools';
import {
  assessmentPracticePool,
  currentAssessmentPracticeContext,
} from '../../course/assessmentPractice';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import { revisionProjection } from '../../course/revisionProjection';
import {
  emptyPerformance,
  gradeFromMarks,
  gradeFromResponse,
  HINT_TIME_PENALTY_SEC,
  updatePerformance,
} from '../../fsrs/grading';
import { applyCooldown, decrementCooldowns } from '../../fsrs/cooldown';
import type { CooldownMap } from '../../fsrs/cooldown';
import { progressHeading } from '../../fsrs/objective';
import { makeExamDateContext, type ExamDateContext } from '../../fsrs/examDate';
import {
  makeSessionContext,
  selectNext,
  sessionComplete,
  sessionProgress,
  sessionServePool,
} from '../../fsrs/session';
import type { SessionContext, SessionUnit } from '../../fsrs/session';
import { availableCards, dueCards } from '../../fsrs/eligibility';
import { buildDeckSecondsMap } from '../../fsrs/stats';
import { startOfDay } from '../../utils/datetime';
import { MS_PER_DAY } from '../../fsrs/params';
import { allocateCramReview } from '../../fsrs/cramAllocator';
import {
  CRAM_SUCCESS_GRADES,
  createHalfLifeLogisticModel,
  readinessFromPredictions,
} from '../../fsrs/halfLifeLogisticModel';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { SessionEvent, SessionSummary } from '../../components/learn/types';
import type { useToast } from '../../components/ui/Toast';
import { linesModeSequencesByCard } from '../../db/linesModeCards';
import { occlusionDataByCard, type OcclusionCardData } from '../../db/occlusionStudy';
import { filterSessionCardPool } from '../../db/search';
import type { CardFilter } from '../../db/search';
import type { TypingSetting } from '../../state/typingSetting';
import { FILTER_LABELS } from './types';
import type {
  LearnModeType,
  LessonNotesScreen,
  Phase,
  MachineMarkedAnswer,
  SessionCardOutcome,
  StudyUnit,
} from './types';
import {
  hasMachineMarkedPayload,
  isTypingEligible,
  isUnrenderableItemPayload,
} from './sessionCardCapabilities';

/** What undoing the most recent answer needs to restore (DB + in-session state). */
interface AnswerSnapshot {
  undo: ReviewUndo;
  cooldowns: CooldownMap;
  eventsLen: number;
  deckId: string;
  deckReviews: number;
  outcomeBefore?: SessionCardOutcome;
  revisionCovered: Set<string>;
  revisionImproved: Set<string>;
  revisionParked: Set<string>;
  revisionCompleted: Set<string>;
  revisionRetryAt: Map<string, number>;
  revisionFailures: Map<string, number>;
  revisionReviewEventIds: string[];
}

type SessionSchedulingConfig = SchedulerConfig & {
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
};

export interface UseLearnSessionParams {
  courseId: string | undefined;
  lessonId: string | undefined;
  sessionId: string | undefined;
  tagFilter: string | null;
  filterParams: CardFilter[];
  requestScopeLessonIds: string[] | undefined;
  practiceNodeKeyParam: string | null;
  requestAssessmentId: string | undefined;
  requestPlanId: string | undefined;
  requestWindowId: string | undefined;
  plannedRevision: boolean;
  reviewSessionKind: ReviewSessionKind;
  isSimpleMode: boolean;
  mode: LearnModeType;
  navigate: NavigateFunction;
  onFlowExit?: () => void;
  onStepFinished?: (summary: SessionSummary) => void;
  notify: ReturnType<typeof useToast>['notify'];
  distraction: DistractionTracker;
  typingSetting: TypingSetting;
  startInFocusMode: boolean;
  /** Motion-speed multiplier (see src/state/motionSpeed.ts), applied to the answer-feedback timer. */
  m: number;
}

/**
 * Owns Learn mode's session state and card-serving/answer/undo/cooldown/revision-plan
 * logic: everything from the initial deck/course/assessment load through grading,
 * undo, and session completion (including assessment revision-plan windows). Extracted
 * from LearnMode.tsx (see docs/archive/roadmap-2026-08-11.md Arc 11 slice-1 Task 0) as a pure state/behaviour
 * extraction — no logic changed, only relocated.
 */
export function useLearnSession({
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
}: UseLearnSessionParams) {
  const reviewSessionIdRef = useRef(sessionId ?? makeId());

  // Exactly one of courseId/lessonId is set by the matching route (or neither,
  // for the cross-course Review today session). The lesson route (/lesson/:lessonId/learn)
  // carries no courseId, so it is resolved from the loaded lesson (see resolvedCourseId).
  const isLessonScoped = !!lessonId;
  const isCourseScoped = !!courseId && !lessonId;
  const isGlobal = !courseId && !lessonId;

  const startInFocusModeRef = useRef(startInFocusMode);
  useEffect(() => {
    startInFocusModeRef.current = startInFocusMode;
  }, [startInFocusMode]);

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
  // region resolves an answerText, never by the blanket typingSetting check that applies
  // to ordinary front_back cards — its plain-text `back` fallback is not a typing target.
  const currentOcclusionData =
    current !== null ? (occlusionMapRef.current.get(current.id) ?? null) : null;
  const isTypingCard =
    typingSetting === 'type' &&
    current !== null &&
    (current.occlusionRegionId !== undefined
      ? currentOcclusionData?.answerText !== undefined
      : isTypingEligible(current));
  const isMachineMarkedCard = hasMachineMarkedPayload(current);
  // A payload the current client cannot render as a study face at all: present but
  // not machine-markable (unknown v, or a known-but-unbuilt kind such as `scaffold`).
  // Renders read-only via UnknownItemFace — never a wrong FSRS mark (docs/archive/roadmap-2026-08-11.md
  // §11.2 rule 3).
  const hasUnrenderableItemPayload = isUnrenderableItemPayload(current);
  // Whether the current card was generated from a lines-mode Sequence (see
  // linesModeCards.ts) — drives the optional first-letter hint step in the question phase.
  const isLinesModeCard = current !== null && linesModeMapRef.current.has(current.id);
  // Cache sessionProgress so repeated calls while the card pool is unchanged don't recompute.
  const progressCacheRef = useRef<{ dirty: boolean; value: number }>({ dirty: true, value: 0 });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // When set, the in-session edit overlay is open for the current card. While it is
  // open the FSRS response timer is paused (see openEdit/resumeTimer) so time spent
  // fixing a card never counts towards the invisible grade.
  const [editing, setEditing] = useState(false);
  // Focus mode hides the surrounding chrome for distraction-free review.
  const [focusMode, setFocusMode] = useState(startInFocusMode);
  const [focusChromeVisible, setFocusChromeVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The keyboard-shortcuts cheatsheet (opened with ?).
  const [hintsOpen, setHintsOpen] = useState(false);
  // Navigation drawer — closed by default to keep Learn mode distraction-free,
  // opened on demand for quick navigation away without leaving the session UI.
  const [navOpen, setNavOpen] = useState(false);
  // A brief, non-blocking flash of colour the instant a card is graded — the small
  // tactile reward that makes answering feel responsive. Cleared on a short timer and
  // never delays the next card.
  const [feedback, setFeedback] = useState<'left' | 'right' | null>(null);
  const [feedbackSource, setFeedbackSource] = useState<'touch' | 'keyboard' | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  // Simple mode: queue of cards that are still unlearned (wrong or unseen).
  const simpleQueue = useRef<Card[]>([]);
  const simpleMastered = useRef<Set<string>>(new Set());
  const simpleWrong = useRef<Set<string>>(new Set());
  // Typed answer for typing cards.
  const [typedAnswer, setTypedAnswer] = useState('');
  const typingInputRef = useRef<HTMLInputElement>(null);
  const [sessionCardIds, setSessionCardIds] = useState<string[]>([]);
  const [sessionCardOutcomes, setSessionCardOutcomes] = useState<Map<string, SessionCardOutcome>>(
    () => new Map(),
  );
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

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Full screen is not available.', 'negative');
    }
  }, [notify]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
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
  // and lesson scope) or a Deck (the global "Today" session).
  const reviewKindRef = useRef<'scheduling-unit' | 'course'>('scheduling-unit');
  // Set for course/lesson-scoped sessions so a completed session can evaluate the
  // semi-linear unlock ratchet (see ratchetUnlocks below). Null for deck/global sessions.
  const ratchetCourseIdRef = useRef<string | null>(null);
  // Set only for lesson scope, so ratchetUnlocks knows which single lesson to
  // evaluate (course/practice-scope completion instead sweeps every lesson).
  const ratchetLessonIdRef = useRef<string | null>(null);
  const cardsRef = useRef<Card[]>([]);
  const lessonExposureIdRef = useRef<string | null>(null);
  const lessonHasMembersRef = useRef(false);
  const practiceSessionRef = useRef<{
    nodeKey: string;
    courseId: string;
    scopeVersion: string;
    scopeCards: Card[];
    course: Course;
    examDateContext: ExamDateContext;
  } | null>(null);
  const revisionPlanRef = useRef<RevisionPlan | null>(null);
  const revisionInitialRevision = useRef(0);
  const revisionWindowStartedAt = useRef(0);
  const revisionCovered = useRef<Set<string>>(new Set());
  const revisionImproved = useRef<Set<string>>(new Set());
  const revisionParked = useRef<Set<string>>(new Set());
  const revisionCompleted = useRef<Set<string>>(new Set());
  const revisionRetryAt = useRef<Map<string, number>>(new Map());
  const revisionFailures = useRef<Map<string, number>>(new Map());
  const revisionReviewEventIds = useRef<string[]>([]);
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
  // Retained across a failed submission retry; cleared only when the player advances.
  const pendingReviewEventId = useRef<string | null>(null);
  // Per-deck review counters for the daily workload cap.
  const reviewsByDeck = useRef<Map<string, number>>(new Map());
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
  const exitTo = isLessonScoped
    ? resolvedCourseId
      ? `/course/${resolvedCourseId}/lesson/${lessonId}`
      : '/'
    : isCourseScoped
      ? `/course/${courseId}`
      : '/';
  const backOut = useCallback(() => {
    if (onFlowExit) onFlowExit();
    else navigate(exitTo);
  }, [navigate, exitTo, onFlowExit]);

  const objectiveLabel = useCallback(() => {
    if (isSimpleMode) return 'Cards correct in this pass';
    if (singleDeck) return progressHeading(singleDeck);
    return 'Predicted readiness across all courses';
  }, [isSimpleMode, singleDeck]);

  /**
   * Evaluate and, where satisfied, write the semi-linear unlock ratchet (Course
   * Architecture Plan Addendum 2, §I) after a course/lesson-scoped session reaches
   * its objective. No-ops for deck-scoped or global sessions, or when the course
   * is not under `semi-linear` unlock mode.
   *
   *  - Lesson-scoped completion: evaluates only the pair (this lesson, its
   *    successor). Whether a Practice node gates that pair is determined from
   *    the course's manual practice nodes via `practiceGateAfterLesson` (only
   *    manual nodes gate — see that function's doc comment for why auto nodes
   *    are excluded): `practiceGoalReached` is `undefined` when no manual node
   *    sits in the slot (condition 1, lessonTaught, gates alone), or `false`
   *    when one does — the lesson session itself cannot have satisfied a
   *    practice objective, so the pair stays blocked until a practice session
   *    over that node reaches its goal (the branch below).
   *  - Course-scoped completion re-evaluates each slot against the exact active
   *    manual checkpoints in that slot. Completing one checkpoint can therefore
   *    never satisfy an unrelated gate elsewhere in the course.
   */
  const ratchetUnlocks = useCallback(async (reachedGoal: boolean) => {
    if (!reachedGoal) return;
    const cId = ratchetCourseIdRef.current;
    if (!cId) return;
    const course = await getCourse(cId);
    if (!course || course.unlockMode !== 'semi-linear') return;
    const lessons = await db.lessons.where('courseId').equals(cId).sortBy('orderIndex');
    const coreLessons = lessons.filter((lesson) => !lesson.isExtension);
    const lId = ratchetLessonIdRef.current;
    const now = Date.now();
    const lessonIds = coreLessons.map((lesson) => lesson.id);
    const [rawCourseCards, links, exposures, completions, practiceNodes, examDates, milestones] =
      await Promise.all([
        db.cards.where('courseId').equals(cId).toArray(),
        lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
        lessonIds.length > 0
          ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
          : [],
        lessonIds.length > 0
          ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray()
          : [],
        db.practiceNodes.where('courseId').equals(cId).toArray(),
        listCourseAssessments(cId),
        db.practiceMilestones.where('courseId').equals(cId).toArray(),
      ]);
    const courseCards = await hydrateCardsWithHistory(rawCourseCards);
    const performance = await performanceForCourseBackingDecks(cId, courseCards);
    const lessonCardsById = new Map(
      lessons.map((lesson) => [lesson.id, lessonCardMembership(lesson.id, courseCards, links)]),
    );
    const meanReviewSeconds = courseMeanReviewSeconds(
      courseCards,
      buildDeckSecondsMap(performance),
    );
    const currentPractice = currentAssessmentPracticeContext({
      course,
      assessments: examDates,
      lessons,
      cards: courseCards,
      links,
      exposures,
      now,
    });
    const currentPracticeScope = currentPractice.scope;
    const nodes = buildPath(
      course,
      lessons,
      examDates,
      lessonCardsById,
      practiceNodes,
      dueCards(availableCards(currentPracticeScope, now), now).length,
      meanReviewSeconds,
      now,
      {
        exposures,
        lessonCompletions: completions,
        practiceMilestones: milestones,
      },
      currentPractice.assessmentOptions[0]?.examDate,
    );
    const snapshot = buildCourseStudyFlowSnapshot({
      course,
      nodes,
      cards: courseCards,
      links,
      exposures,
      examDateContext: makeExamDateContext(course, lessons, examDates),
      meanReviewSeconds,
      practiceMilestones: milestones,
      now,
    });
    for (let i = 0; i < coreLessons.length - 1; i++) {
      const lessonN = coreLessons[i];
      const lessonN1 = coreLessons[i + 1];
      if (lessonN1.unlockedAt !== undefined) continue;
      if (lId && lessonN.id !== lId) continue;
      const lessonNCards = lessonCardMembership(lessonN.id, courseCards, links);
      const practiceGoalReached = manualPracticeGateOutcomeAfterLesson(
        coreLessons,
        practiceNodes,
        lessonN.id,
        snapshot.activeManualNodeKeys,
        snapshot.completedManualNodeKeys,
      );
      if (
        nextLessonUnlockCondition(
          lessonN.id,
          lessonNCards,
          exposures,
          completions,
          practiceGoalReached,
        )
      ) {
        await ratchetLessonUnlock(lessonN1.id, now);
      }
    }
  }, []);

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
      const practice = practiceSessionRef.current;
      if (!practice) return;
      const cardsById = new Map(cards.map((card) => [card.id, card]));
      const currentScope = practice.scopeCards.map((card) => cardsById.get(card.id) ?? card);
      const readiness = practiceReadiness(currentScope, practice.course, practice.examDateContext);
      await savePracticeMilestoneProgress(
        practice.nodeKey,
        practice.courseId,
        practice.scopeVersion,
        readiness.securedCardCount,
        readiness.totalCardCount,
        completed,
      );
    },
    [],
  );

  const finaliseSummary = useCallback(
    (nextSummary: SessionSummary) => {
      if (!mountedRef.current || finalising.current) return;
      finalising.current = true;
      setCanUndo(false);
      lastAnswer.current = null;
      void (async () => {
        let deliveredSummary = nextSummary;
        const revisionPlan = revisionPlanRef.current;
        if (revisionPlan && requestWindowId) {
          const completedAt = Date.now();
          const refreshedPlan = await refreshRevisionPlan(
            revisionPlan.id,
            revisionPlan.input.projection,
            completedAt,
          );
          const updatedPlan = await completeRevisionWindow(
            refreshedPlan.id,
            requestWindowId,
            {
              id: reviewSessionIdRef.current,
              windowId: requestWindowId,
              startedAt: revisionWindowStartedAt.current,
              completedAt,
              cardIds: [...revisionCovered.current],
              reviewEventIds: revisionReviewEventIds.current,
              improvedCardIds: [...revisionImproved.current],
              parkedCardIds: [...revisionParked.current],
            },
            completedAt,
          );
          revisionPlanRef.current = updatedPlan;
          const windowDayParts = requestWindowId.split(':');
          const completedWindowDay = windowDayParts[windowDayParts.length - 1];
          const nextWindow = updatedPlan.windows.find(
            (window) => window.status === 'scheduled' && window.day >= completedWindowDay,
          );
          const latestReplan =
            updatedPlan.revision > revisionInitialRevision.current
              ? updatedPlan.replans[updatedPlan.replans.length - 1]
              : undefined;
          const objectiveContext = ctxRef.current?.decks.values().next().value?.oc;
          const model = objectiveContext
            ? createHalfLifeLogisticModel(objectiveContext.ctx.decay)
            : undefined;
          const readinessCards = cardsRef.current.filter((card) =>
            updatedPlan.scope.eligibleCardIds.includes(card.id),
          );
          const readiness =
            model &&
            updatedPlan.input.projection.projectionMode === 'memory-model' &&
            model.version === updatedPlan.input.projection.memoryModelVersion &&
            readinessCards.every(
              (card) =>
                model.validate({
                  card,
                  now: completedAt,
                  assessmentAt: updatedPlan.input.deadlineAt,
                }).valid,
            )
              ? readinessFromPredictions(
                  readinessCards.map((card) =>
                    model.predictRecall({ card, at: updatedPlan.input.deadlineAt }),
                  ),
                )
              : null;
          deliveredSummary = {
            ...nextSummary,
            reachedGoal: true,
            revision: {
              cardsCovered: revisionCovered.current.size,
              cardsImproved: revisionImproved.current.size,
              cardsParked: revisionParked.current.size,
              workNotReached: Math.max(
                0,
                revisionPlan.scope.eligibleCardIds.length - revisionCovered.current.size,
              ),
              ...(readiness?.standardDeviation === undefined
                ? {}
                : {
                    predictedReadiness: readiness.probability,
                    readinessUncertainty: readiness.standardDeviation,
                  }),
              ...(nextWindow ? { nextWindowDay: nextWindow.day } : {}),
              ...(latestReplan?.explanation ? { replanExplanation: latestReplan.explanation } : {}),
            },
          };
        }
        if (practiceSessionRef.current) {
          await persistPracticeMilestone(cardsRef.current, deliveredSummary.reachedGoal);
        }
        if (!revisionPlan && ratchetCourseIdRef.current) {
          await ratchetUnlocks(deliveredSummary.reachedGoal);
        }
        if (!mountedRef.current) return;
        if (onStepFinished) {
          onStepFinished(deliveredSummary);
          return;
        }
        setSummary(deliveredSummary);
        setPhase('finished');
      })().catch((cause) => {
        finalising.current = false;
        notify(
          cause instanceof Error ? cause.message : 'Could not finish the study window.',
          'negative',
        );
      });
    },
    [notify, onStepFinished, persistPracticeMilestone, ratchetUnlocks, requestWindowId],
  );

  const finish = useCallback(
    (reachedGoal: boolean, limitReached = false, timeLimitReached = false) => {
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

    if (isSimpleMode) {
      const remaining = simpleQueue.current.filter((c) => !simpleMastered.current.has(c.id));
      if (remaining.length === 0) {
        finish(true);
        return;
      }
      const next = remaining[0];
      if (!mountedRef.current) return;
      setCurrent(next);
      if (!mountedRef.current) return;
      setPhase('question');
      setMenuOpen(false);
      setTypedAnswer('');
      setHintStep(0);
      pendingReviewEventId.current = null;
      timerStart.current = performance.now();
      distraction.beginCard();
      distraction.setAnswerVisible(false);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;
    const revisionPlan = revisionPlanRef.current;
    if (revisionPlan && requestWindowId) {
      const window = revisionPlan.windows.find((candidate) => candidate.id === requestWindowId);
      const now = Date.now();
      const remainingWindowSeconds = window
        ? window.budgetMinutes * 60 - (now - revisionWindowStartedAt.current) / 1000
        : 0;
      if (!window || remainingWindowSeconds <= 0 || now >= revisionPlan.input.deadlineAt) {
        for (const cardId of revisionRetryAt.current.keys()) revisionParked.current.add(cardId);
        finish(false, false, true);
        return;
      }
      const eligibleCardIds = new Set(
        revisionPlan.scope.eligibleCardIds.filter(
          (cardId) =>
            !revisionCompleted.current.has(cardId) &&
            !revisionParked.current.has(cardId) &&
            (revisionRetryAt.current.get(cardId) ?? 0) <= now,
        ),
      );
      const objectiveContext = ctx.decks.values().next().value?.oc;
      if (!objectiveContext) return;
      const allocation = allocateCramReview({
        cards: cardsRef.current,
        eligibleCardIds,
        context: objectiveContext,
        assessmentAt: revisionPlan.input.deadlineAt,
        now,
        remainingWindowSeconds,
        currentWindowId: requestWindowId,
        futureWindowStarts: [],
        projection: revisionPlan.input.projection,
        model: createHalfLifeLogisticModel(objectiveContext.ctx.decay),
        successGrades: CRAM_SUCCESS_GRADES,
        performanceByDeck: perfRef.current,
      });
      const next =
        allocation.mode === 'practice-fallback' ? allocation.cards[0] : allocation.selected?.card;
      if (!next) {
        for (const cardId of revisionRetryAt.current.keys()) revisionParked.current.add(cardId);
        finish(true);
        return;
      }
      setCurrent(next);
      setPhase('question');
      setMenuOpen(false);
      setTypedAnswer('');
      setHintStep(0);
      pendingReviewEventId.current = null;
      timerStart.current = performance.now();
      distraction.beginCard();
      distraction.setAnswerVisible(false);
      progressCacheRef.current.dirty = true;
      return;
    }
    if (sessionComplete(cardsRef.current, ctx)) {
      finish(true);
      return;
    }
    const next = selectNext(cardsRef.current, ctx, cooldowns.current);
    if (!next) {
      finish(true);
      return;
    }
    if (!mountedRef.current) return;
    setCurrent(next);
    if (!mountedRef.current) return;
    setPhase('question');
    setMenuOpen(false);
    setTypedAnswer('');
    setHintStep(0);
    pendingReviewEventId.current = null;
    timerStart.current = performance.now();
    distraction.beginCard();
    distraction.setAnswerVisible(false);
    // Invalidate progress cache when moving to a new card.
    progressCacheRef.current.dirty = true;
  }, [finish, distraction, isSimpleMode, requestWindowId]);

  // Stable ref so the initial-load effect never re-runs just because serveNext's
  // callback identity changed (which would reset phase and undo reveal/exit).
  const serveNextRef = useRef(serveNext);
  serveNextRef.current = serveNext;

  // Initial load: read a static snapshot of the deck(s) so the session is stable.
  useEffect(() => {
    let cancelled = false;
    // Reset all session refs so navigating deck -> deck does not leave stale state.
    cooldowns.current = new Map();
    events.current = [];
    lastAnswer.current = null;
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
    setFeedback(null);
    setFeedbackSource(null);
    submitting.current = false;
    finalising.current = false;
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
    revisionCovered.current = new Set();
    revisionImproved.current = new Set();
    revisionParked.current = new Set();
    revisionCompleted.current = new Set();
    revisionRetryAt.current = new Map();
    revisionFailures.current = new Map();
    revisionReviewEventIds.current = [];
    setCanUndo(false);
    setSummary(null);
    setEditing(false);
    setMenuOpen(false);
    setHintsOpen(false);
    setNavOpen(false);
    setFocusMode(startInFocusModeRef.current);
    setFocusChromeVisible(false);
    setSessionCardIds([]);
    setSessionCardOutcomes(new Map());
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
    void (async () => {
      let units: StudyUnit[];
      let sessionUnits: SchedulingUnitRecord[] | SessionUnit[];
      let cards: Card[];
      // Set for lesson sessions so notes always precede the Simple-mode pass.
      let firstStudyLessonId: string | undefined;
      let firstStudyLessonName: string | undefined;

      if (lessonId) {
        const lesson: Lesson | undefined = await db.lessons.get(lessonId);
        if (!lesson) {
          if (onFlowExit) onFlowExit();
          else navigate('/');
          return;
        }
        const course = await getCourse(lesson.courseId);
        if (!course) {
          if (onFlowExit) onFlowExit();
          else navigate('/');
          return;
        }
        setResolvedCourseId(course.id);
        const [courseLessons, examDates, links, rawAllCourseCards, lessonExposures] =
          await Promise.all([
            db.lessons.where('courseId').equals(course.id).toArray(),
            listCourseAssessments(course.id),
            db.lessonCards.where('lessonId').equals(lessonId).toArray(),
            db.cards.where('courseId').equals(course.id).toArray(),
            db.lessonCardExposures.where('lessonId').equals(lessonId).toArray(),
          ]);
        const allCourseCards = await hydrateCardsWithHistory(rawAllCourseCards);
        const linkedCardIds = new Set(links.map((link) => link.cardId));
        const membership = lessonCardMembership(lessonId, allCourseCards, links);
        cards = lessonStudyPool(lessonId, allCourseCards, links, lessonExposures);
        lessonHasMembersRef.current = membership.length > 0;
        const examDateContext = makeExamDateContext(course, courseLessons, examDates);
        const schedulingUnit = (await getSchedulingUnit(course.id, lessonId)) ?? course;
        units = [course];
        sessionUnits = [
          {
            config: schedulingUnit,
            scope: { kind: 'lesson', courseId: course.id, lessonId, linkedCardIds },
            examDateContext,
          },
        ];
        reviewKindRef.current = 'course';
        ratchetCourseIdRef.current = course.id;
        ratchetLessonIdRef.current = lessonId;
        lessonExposureIdRef.current = lessonId;
        setUnitDisplayName(lesson.name);
        firstStudyLessonId = lessonId;
        firstStudyLessonName = lesson.name;
      } else if (courseId) {
        const course = await getCourse(courseId);
        if (!course) {
          if (onFlowExit) onFlowExit();
          else navigate('/');
          return;
        }
        const [rawAllCards, courseLessons, examDates, manualNodes] = await Promise.all([
          db.cards.where('courseId').equals(courseId).toArray(),
          db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
          listCourseAssessments(courseId),
          db.practiceNodes.where('courseId').equals(courseId).toArray(),
        ]);
        const allCards = await hydrateCardsWithHistory(rawAllCards);
        const courseLessonIds = courseLessons.map((lesson) => lesson.id);
        const [courseLinks, courseExposures] = await Promise.all([
          courseLessonIds.length > 0
            ? db.lessonCards.where('lessonId').anyOf(courseLessonIds).toArray()
            : [],
          courseLessonIds.length > 0
            ? db.lessonCardExposures.where('lessonId').anyOf(courseLessonIds).toArray()
            : [],
        ]);
        const effectiveDates = lessonEffectiveReleaseDates(course, courseLessons);
        const reachedLessonIds: Set<string> = requestScopeLessonIds
          ? new Set<string>(requestScopeLessonIds)
          : new Set(
              courseLessons
                .filter((lesson) => isLessonUnlocked(course, lesson, effectiveDates, courseLessons))
                .map((lesson) => lesson.id),
            );
        const practiceNode = practiceNodeKeyParam
          ? manualNodes.find((node) => node.id === practiceNodeKeyParam)
          : undefined;
        const selectedAssessment = requestAssessmentId
          ? examDates.find((assessment) => assessment.id === requestAssessmentId)
          : undefined;
        if (requestAssessmentId && !selectedAssessment) {
          if (onFlowExit) onFlowExit();
          else navigate(`/course/${courseId}`);
          return;
        }
        let activeRevisionPlan: RevisionPlan | null = null;
        if (plannedRevision && requestPlanId && requestWindowId && selectedAssessment) {
          const refreshed = await refreshRevisionPlan(requestPlanId, revisionProjection);
          if (
            refreshed.assessmentId !== selectedAssessment.id ||
            refreshed.courseId !== course.id ||
            !refreshed.windows.some((window) => window.id === requestWindowId)
          ) {
            throw new Error('The revision plan does not match this assessment window.');
          }
          activeRevisionPlan = await startRevisionWindow(requestPlanId, requestWindowId);
          const activeWindow = activeRevisionPlan.windows.find(
            (window) => window.id === requestWindowId,
          );
          revisionPlanRef.current = activeRevisionPlan;
          revisionInitialRevision.current = activeRevisionPlan.revision;
          revisionWindowStartedAt.current = activeWindow?.startedAt ?? Date.now();
          const budgetSeconds = (activeWindow?.budgetMinutes ?? 0) * 60;
          setRevisionWindowBudgetSeconds(budgetSeconds);
          setRevisionSecondsRemaining(
            Math.max(0, budgetSeconds - (Date.now() - revisionWindowStartedAt.current) / 1000),
          );
          setRevisionNextWindowDay(
            activeRevisionPlan.windows.find(
              (window) => window.status === 'scheduled' && window.id !== requestWindowId,
            )?.day,
          );
        }
        const fullScope = selectedAssessment
          ? resolveAssessmentCoverage(selectedAssessment, courseLessons, allCards, courseLinks)
              .cards
          : practiceCardScope(
              allCards,
              courseLinks,
              courseExposures,
              { reachedLessonIds, practiceNode },
              Date.now(),
              course.leechThreshold,
            );
        const examDateContext = selectedAssessment
          ? {
              courseExamDate: selectedAssessment.examDate,
              lessonsById: new Map<string, Lesson>(),
              courseAssessments: [],
            }
          : makeExamDateContext(course, courseLessons, examDates);
        cards = selectedAssessment
          ? activeRevisionPlan
            ? allCards.filter((card) => activeRevisionPlan.scope.eligibleCardIds.includes(card.id))
            : assessmentPracticePool(selectedAssessment, {
                course,
                lessons: courseLessons,
                cards: allCards,
                links: courseLinks,
                exposures: courseExposures,
                reachedLessonIds,
              })
          : eligiblePracticePool(fullScope, course, examDateContext);
        const schedulingUnit = (await getSchedulingUnit(course.id)) ?? course;
        const practiceConfig: SessionSchedulingConfig = {
          ...schedulingUnit,
          newCardsPerDay: undefined,
        };
        units = [course];
        sessionUnits = [
          {
            config: practiceConfig,
            scope: { kind: 'course', courseId },
            examDateContext,
          },
        ];
        reviewKindRef.current = 'course';
        ratchetCourseIdRef.current = course.id;
        setUnitDisplayName(selectedAssessment?.name ?? course.name);
        if (practiceNodeKeyParam) {
          const scopeVersion = practiceScopeVersion(fullScope);
          practiceSessionRef.current = {
            nodeKey: practiceNodeKeyParam,
            courseId,
            scopeVersion,
            scopeCards: fullScope,
            course,
            examDateContext,
          };
        }
      } else {
        const schedulingUnits = await db.schedulingUnits.toArray();
        units = schedulingUnits;
        sessionUnits = schedulingUnits;
        cards = await hydrateCardsWithHistory(await db.cards.toArray());
      }
      if (cancelled) return;

      cards = filterSessionCardPool(cards, { tag: tagFilter, filters: filterParams });

      if (isSimpleMode) {
        const now = Date.now();
        cards = cards.filter(
          (card) => !card.suspended && !(card.buriedUntil && card.buriedUntil > now),
        );
      }

      const perfs = await performanceForReviewUnits(units.map((unit) => unit.id), reviewKindRef.current);
      const perfMap = new Map<string, UserPerformance>();
      units.forEach((u, i) => perfMap.set(u.id, perfs[i] ?? emptyPerformance(u.id)));
      perfRef.current = perfMap;
      schedulingUnitsRef.current = new Map(units.map((u) => [u.id, u]));
      schedulingConfigRef.current =
        sessionUnits.length === 1 && 'config' in sessionUnits[0]
          ? sessionUnits[0].config
          : null;
      const ctx = makeSessionContext(sessionUnits, 'objective');
      ctxRef.current = ctx;
      cardsRef.current = cards;
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
      const initialProgress = sessionProgress(cards, ctx);
      const hasServeableCards = plannedRevision
        ? cards.length > 0
        : isSimpleMode
          ? cards.length > 0
          : sessionServePool(cards, ctx).length > 0;
      setSchedulerProgress(initialProgress);
      setSessionCardIds(cards.map((card) => card.id));
      setSessionCardOutcomes(new Map());
      reviewsByDeck.current = new Map();
      setLimitOverride(false);
      setSingleDeck((prev) => {
        const next = !isGlobal ? units[0] : null;
        if (prev?.id === next?.id) return prev;
        return next;
      });

      if (isSimpleMode) {
        simpleQueue.current = [...cards];
        simpleMastered.current = new Set();
        simpleWrong.current = new Set();
      }

      // A lesson always opens with its notes, including a cardless lesson. The
      // Continue action owns cardless completion; card sessions continue into
      // the Simple-mode queue below.
      if (firstStudyLessonId && firstStudyLessonName) {
        const lessonNotes = await listNotes(firstStudyLessonId);
        if (cancelled) return;
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
        finaliseSummary({
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
      if (!plannedRevision && !isSimpleMode && sessionComplete(cards, ctx)) {
        finaliseSummary({
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
        sessionStartMs.current = revisionWindowStartedAt.current || Date.now();
        serveNextRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    courseId,
    lessonId,
    tagFilter,
    filterParams,
    navigate,
    onFlowExit,
    isSimpleMode,
    mode,
    isGlobal,
    practiceNodeKeyParam,
    requestScopeLessonIds,
    requestAssessmentId,
    requestPlanId,
    requestWindowId,
    plannedRevision,
    finaliseSummary,
    persistPracticeMilestone,
    ratchetUnlocks,
  ]);

  const reveal = useCallback(() => {
    setPhase((p) => {
      if (p !== 'question') return p;
      responseTime.current = (performance.now() - timerStart.current) / 1000;
      return 'answer';
    });
    distraction.setAnswerVisible(true);
  }, [distraction]);

  const hide = useCallback(() => {
    setPhase((p) => {
      if (p !== 'answer') return p;
      return 'question';
    });
    distraction.setAnswerVisible(false);
  }, [distraction]);

  const answer = useCallback(
    async (
      input: boolean | Grade | MachineMarkedAnswer,
      source: 'touch' | 'keyboard' = 'keyboard',
    ) => {
      if (submitting.current) return;
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
        return;
      }

      try {
        const correct: boolean = machineMarked
          ? machineMarked.correct
          : typeof input === 'number'
            ? input > 1
            : input === true;

        if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
        setFeedbackSource(source);
        setFeedback(correct ? 'right' : 'left');
        feedbackTimer.current = window.setTimeout(
          () => {
            setFeedback(null);
            setFeedbackSource(null);
          },
          Math.round(400 * m),
        );

        const t = machineMarked
          ? (performance.now() - timerStart.current) / 1000
          : responseTime.current;
        const distracted = distraction.wasDistracted();

        if (isSimpleMode) {
          const grade: Grade = machineMarked
            ? gradeFromMarks(machineMarked.marksEarned, machineMarked.marksAvailable, t, false)
            : correct
              ? 3
              : 1;
          events.current = [...events.current, { grade, correct, responseTimeSec: t, distracted }];

          if (correct) {
            if (lessonExposureIdRef.current) {
              await upsertLessonCardExposure(lessonExposureIdRef.current, cardNow.id);
            }
            simpleMastered.current.add(cardNow.id);
            simpleWrong.current.delete(cardNow.id);
          } else {
            simpleWrong.current.add(cardNow.id);
            // Re-queue the card at the end so it comes back later.
            simpleQueue.current = [
              ...simpleQueue.current.filter((c) => c.id !== cardNow.id),
              cardNow,
            ];
          }
          setSessionCardOutcomes((previous) => {
            const next = new Map(previous);
            next.set(cardNow.id, correct ? 'correct' : 'wrong');
            return next;
          });

          const remaining = simpleQueue.current.filter(
            (c) => !simpleMastered.current.has(c.id),
          ).length;
          if (remaining === 0) {
            finish(true);
          } else {
            serveNext();
          }
          return;
        }

        const ctx = ctxRef.current;
        // Global sessions key units by the card's explicit schedulingUnitId;
        // course and lesson scope use their sole resolved target unit.
        const deck = isGlobal
          ? cardNow.schedulingUnitId
            ? schedulingUnitsRef.current.get(cardNow.schedulingUnitId)
            : undefined
          : schedulingUnitsRef.current.values().next().value;
        const schedulingConfig = isGlobal
          ? deck
          : schedulingConfigRef.current;
        if (!ctx || !deck || !schedulingConfig) {
          submitting.current = false;
          return;
        }

        const manualGrade: Grade | null = typeof input === 'number' ? input : null;
        const perf = perfRef.current.get(deck.id);
        // Hint usage only ever nudges the silent-mode grade (see HINT_TIME_PENALTY_SEC);
        // the true, unpenalised response time is still what's persisted and calibrated on
        // below (recordReview's responseTimeSec and updatePerformance).
        const hintUsed = hintStepRef.current > 0;
        const grade: Grade = machineMarked
          ? gradeFromMarks(machineMarked.marksEarned, machineMarked.marksAvailable, t, false)
          : (manualGrade ??
            gradeFromResponse(correct, hintUsed ? t + HINT_TIME_PENALTY_SEC : t, perf));

        const cooldownsSnapshot = new Map(cooldowns.current);
        const eventsLen = events.current.length;
        const perfBefore = perf ?? null;
        const outcomeBefore = sessionCardOutcomes.get(cardNow.id);
        const eventId = pendingReviewEventId.current ?? makeId();
        const revisionSnapshot = {
          revisionCovered: new Set(revisionCovered.current),
          revisionImproved: new Set(revisionImproved.current),
          revisionParked: new Set(revisionParked.current),
          revisionCompleted: new Set(revisionCompleted.current),
          revisionRetryAt: new Map(revisionRetryAt.current),
          revisionFailures: new Map(revisionFailures.current),
          revisionReviewEventIds: [...revisionReviewEventIds.current],
        };
        pendingReviewEventId.current = eventId;

        const {
          card: updated,
          cardBefore,
          recorded,
          sessionHistoryId,
          kind,
          lastInteractedAtBefore,
          updatedAtBefore,
        } = await recordReview({
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
        });

        if (correct && perf) {
          const nextPerf = recorded
            ? updatePerformance(perf, t)
            : await performanceForReviewUnit(deck.id, kind);
          if (nextPerf) perfRef.current.set(deck.id, nextPerf);
        }

        const nextCards = cardsRef.current.map((c) => (c.id === updated.id ? updated : c));
        cardsRef.current = nextCards;
        setSchedulerProgress(sessionProgress(nextCards, ctx));
        if (practiceSessionRef.current) {
          await persistPracticeMilestone(nextCards, false);
        }

        if (revisionPlanRef.current && requestWindowId) {
          revisionCovered.current.add(updated.id);
          if (recorded) revisionReviewEventIds.current.push(eventId);
          if (correct) {
            revisionImproved.current.add(updated.id);
            revisionCompleted.current.add(updated.id);
            revisionRetryAt.current.delete(updated.id);
          } else {
            const failures = (revisionFailures.current.get(updated.id) ?? 0) + 1;
            revisionFailures.current.set(updated.id, failures);
            const window = revisionPlanRef.current.windows.find(
              (candidate) => candidate.id === requestWindowId,
            );
            const windowEndsAt = window
              ? revisionWindowStartedAt.current + window.budgetMinutes * 60_000
              : Date.now();
            const productiveAt = updated.due ?? Date.now();
            if (failures >= 2 || productiveAt >= windowEndsAt) {
              revisionParked.current.add(updated.id);
              revisionRetryAt.current.delete(updated.id);
            } else {
              revisionRetryAt.current.set(updated.id, Math.max(Date.now(), productiveAt));
            }
          }
        } else if (grade === 1) {
          // Global sessions span several decks, so size the cooldown to just this
          // card's deck; course/lesson sessions are already scoped to their own
          // pool (see the loading effect), so the whole pool applies.
          const deckSize = isGlobal
            ? nextCards.filter((c) => c.schedulingUnitId === deck.id).length
            : nextCards.length;
          applyCooldown(cooldowns.current, updated.id, deckSize);
        }
        if (!revisionPlanRef.current) decrementCooldowns(cooldowns.current, updated.id);

        events.current = [...events.current, { grade, correct, responseTimeSec: t, distracted }];
        setSessionCardOutcomes((previous) => {
          const next = new Map(previous);
          next.set(cardNow.id, correct ? 'correct' : 'wrong');
          return next;
        });

        const deckReviews = (reviewsByDeck.current.get(deck.id) ?? 0) + 1;
        reviewsByDeck.current.set(deck.id, deckReviews);

        lastAnswer.current = recorded
          ? {
              undo: {
                eventId,
                cardBefore,
                perfBefore,
                sessionHistoryId,
                deckId: deck.id,
                kind,
                lastInteractedAtBefore,
                updatedAtBefore,
              },
              cooldowns: cooldownsSnapshot,
              eventsLen,
              deckId: deck.id,
              deckReviews,
              outcomeBefore,
              ...revisionSnapshot,
            }
          : null;
        setCanUndo(recorded);

        progressCacheRef.current.dirty = true;

        const limit = schedulingConfig.maxReviewsPerDay;
        if (!limitOverride && limit && limit > 0 && deckReviews >= limit) {
          finish(false, true);
          return;
        }

        const goal = schedulingConfig.dailyReviewGoal;
        if (!limitOverride && goal && goal > 0 && deckReviews >= goal) {
          finish(true);
          return;
        }

        const revisionPlan = revisionPlanRef.current;
        const revisionWindow = revisionPlan?.windows.find(
          (candidate) => candidate.id === requestWindowId,
        );
        if (
          revisionPlan &&
          revisionWindow &&
          Date.now() >= revisionWindowStartedAt.current + revisionWindow.budgetMinutes * 60_000
        ) {
          finish(false, false, true);
          return;
        }

        const timeLimit = schedulingConfig.sessionTimeLimitMinutes;
        if (!timeLimitOverride && timeLimit && timeLimit > 0 && sessionStartMs.current > 0) {
          const elapsedMinutes = (Date.now() - sessionStartMs.current) / 60000;
          if (elapsedMinutes >= timeLimit) {
            finish(false, false, true);
            return;
          }
        }

        if (revisionPlanRef.current) serveNext();
        else if (sessionComplete(nextCards, ctx)) finish(true);
        else serveNext();
      } finally {
        submitting.current = false;
      }
    },
    [
      distraction,
      finish,
      serveNext,
      limitOverride,
      timeLimitOverride,
      m,
      isSimpleMode,
      isGlobal,
      persistPracticeMilestone,
      sessionCardOutcomes,
      reviewSessionKind,
      requestWindowId,
    ],
  );

  const undoLast = useCallback(async () => {
    const snap = lastAnswer.current;
    const ctx = ctxRef.current;
    if (!snap || !ctx) return;
    try {
      await undoReview(snap.undo);
      if (!mountedRef.current) return;
      cardsRef.current = cardsRef.current.map((c) =>
        c.id === snap.undo.cardBefore.id ? snap.undo.cardBefore : c,
      );
      setSchedulerProgress(sessionProgress(cardsRef.current, ctx));
      cooldowns.current = snap.cooldowns;
      revisionCovered.current = snap.revisionCovered;
      revisionImproved.current = snap.revisionImproved;
      revisionParked.current = snap.revisionParked;
      revisionCompleted.current = snap.revisionCompleted;
      revisionRetryAt.current = snap.revisionRetryAt;
      revisionFailures.current = snap.revisionFailures;
      revisionReviewEventIds.current = snap.revisionReviewEventIds;
      if (snap.undo.perfBefore) perfRef.current.set(snap.deckId, snap.undo.perfBefore);
      events.current = events.current.slice(0, snap.eventsLen);
      // Decrement the per-deck review counter on undo.
      const prevReviews = snap.deckReviews - 1;
      if (prevReviews > 0) reviewsByDeck.current.set(snap.deckId, prevReviews);
      else reviewsByDeck.current.delete(snap.deckId);
      lastAnswer.current = null;
      setCanUndo(false);
      progressCacheRef.current.dirty = true;
      setCurrent(snap.undo.cardBefore);
      setSessionCardOutcomes((previous) => {
        const next = new Map(previous);
        if (snap.outcomeBefore) next.set(snap.undo.cardBefore.id, snap.outcomeBefore);
        else next.delete(snap.undo.cardBefore.id);
        return next;
      });
      setPhase('question');
      pendingReviewEventId.current = null;
      setMenuOpen(false);
      timerStart.current = performance.now();
      distraction.beginCard();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not undo the last answer.', 'negative');
    }
  }, [distraction, notify]);

  /** Drop the current card from the live pool after a suspend/bury, then move on. */
  const afterRemoval = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!mountedRef.current) return;
    setMenuOpen(false);
    setCanUndo(false);
    lastAnswer.current = null;
    const removedId = currentRef.current?.id;
    if (removedId) {
      setSessionCardIds((previous) => previous.filter((id) => id !== removedId));
      setSessionCardOutcomes((previous) => {
        const next = new Map(previous);
        next.delete(removedId);
        return next;
      });
    }
    progressCacheRef.current.dirty = true;
    setSchedulerProgress(sessionProgress(cardsRef.current, ctx));
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
    setMenuOpen(false);
    // Only the question phase has a running timer; the answer phase already
    // captured responseTime at reveal, so there is nothing to pause there.
    if (phase === 'question') {
      pausedElapsed.current = performance.now() - timerStart.current;
    }
    setEditing(true);
  }, [current, phase]);

  /** Rebase the timer so editing time is excluded, then leave the overlay. */
  const resumeAfterEdit = useCallback(() => {
    if (phase === 'question') {
      timerStart.current = performance.now() - pausedElapsed.current;
    }
  }, [phase]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    resumeAfterEdit();
  }, [resumeAfterEdit]);

  const handleEdited = useCallback(
    (updated: Card) => {
      cardsRef.current = cardsRef.current.map((c) => (c.id === updated.id ? updated : c));
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
      cardsRef.current = cardsRef.current.map((c) => (c.id === current.id ? updated : c));
      setCurrent(updated);
      setMenuOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update the card flag.', 'negative');
    }
  }, [current, notify]);

  return {
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
    occlusion: currentOcclusionData?.occlusion,
    occlusionAnswerText: currentOcclusionData?.answerText,
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
    limitOverride,
    setLimitOverride,
    timeLimitOverride,
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
    // Session refs the render body reads directly (restart handlers, tag suggestions).
    cardsRef,
    ctxRef,
    events,
    progressBefore,
    sessionStartMs,
    simpleQueue,
    simpleMastered,
    simpleWrong,
    lessonHasMembersRef,
  };
}
