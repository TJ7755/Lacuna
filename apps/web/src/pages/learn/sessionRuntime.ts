import { liveQuery, type Subscription } from 'dexie';
import { canEditLessons } from '../../course/lessonViewMode';
import type { JevMarkProvenance } from '@lacuna/core/jev/types';
import { createRevisionSessionState } from '../../course/revisionSession';
import { type SessionCardOutcome, type SessionSummary } from '../../course/sessionSummary';

import { buryCard, setCardFlag, suspendCard } from '../../db/cardRepository';
import { markLessonComplete } from '../../db/lessonRepository';
import { type OcclusionCardData } from '../../db/occlusionStudy';
import { db, makeId } from '../../db/schema';

import {
  type Card,
  type Lesson,
  type RevisionPlan,
  type SchedulerConfig,
  type Sequence,
  type UserPerformance,
  type Grade,
} from '@lacuna/core/db/types';
import { progressHeading } from '../../fsrs/objective';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import {
  type SessionContext,
  sessionCompletionProgress,
  sessionProgress,
  sessionServePool,
} from '../../fsrs/session';

import { startOfDay } from '../../utils/datetime';
import { resolveAnswerMode, reviewAnswerInput } from '../../utils/resolveAnswerMode';
import { answerCorrect, type AnswerInput, type AnswerResult, answerFeedback } from './answerSteps';
import { canIntroduceCard, introductionProgress, introductionStage } from './lessonIntroduction';
import { startSessionLoad } from './sessionLoading';
import { shuffledSimpleQueue } from './recitation/recitationFlow';
import {
  type AnswerSnapshot,
  persistSessionAnswer,
  undoSessionAnswer,
} from './sessionAnswerPersistence';
import { hasMachineMarkedPayload, isUnrenderableItemPayload } from './sessionCardCapabilities';
import {
  persistSessionCompletion,
  persistSessionPracticeMilestone,
  type PracticeSession,
} from './sessionCompletionPersistence';
import {
  snapshotSession,
  transitionResponseTimer,
  transitionSession,
  type SessionEventInput,
  type SessionState,
  type SessionEffect,
} from './sessionMachine';
import { scheduleSessionPreload } from './sessionPreload';
import { SessionRecitation } from './sessionRecitation';
import { resolveLearnSessionScope } from './sessionScope';
import { clearSimpleSession, saveSimpleSession } from './simpleSessionPersistence';
import {
  type LessonNotesScreen,
  type Phase,
  type StudyUnit,
  type MachineMarkedAnswer,
} from './types';
import { dailyReviewCounts } from '../../db/reviewHistoryRead';
import { emptyPerformance } from '../../fsrs/grading';
import type { SessionRuntimeOptions } from './sessionRuntimeOptions';
import { createSessionCompletion } from './sessionCompletion';
type SessionSchedulingConfig = SchedulerConfig & {
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
};
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

export function emptySessionState(): SessionState {
  const outcomes: SessionState['outcomes'] = new Map();
  return {
    cards: [],
    cardIds: [],
    events: [],
    outcomes,
    cooldowns: new Map(),
    revision: createRevisionSessionState(),
    simple: { queue: [], mastered: new Set(), wrong: new Set(), outcomes },
  };
}

/** Owns a single session, including acknowledged writes and completion. */
export class SessionRuntime {
  constructor(private options: SessionRuntimeOptions) {
    this.reviewSessionId = this.options.sessionId ?? makeId();
  }
  private generation = 0;
  private listeners = new Set<() => void>();
  private snapshot: ReturnType<SessionRuntime['readSnapshot']> | undefined;

  private cancelLoad: (() => void) | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => (this.snapshot ??= this.readSnapshot());
  private publish = () => {
    this.snapshot = undefined;
    if (this.mounted) this.listeners.forEach((listener) => listener());
  };
  updateAdapters(options: SessionRuntimeOptions) {
    if (this.options.answerInputPreference !== options.answerInputPreference)
      this.snapshot = undefined;
    this.options = options;
  }
  start = () => {
    this.generation += 1;
    this.mounted = true;
    this.watchEditPermission();
    this.cancelLoad = this.load();
    if (this.options.plannedRevision)
      this.interval = setInterval(() => {
        this.revisionSecondsRemaining = Math.max(
          0,
          this.revisionWindowBudgetSeconds - (Date.now() - this.revisionWindowStartedAt) / 1000,
        );
        if (
          this.revisionWindowBudgetSeconds > 0 &&
          this.revisionSecondsRemaining <= 0 &&
          this.phase !== 'loading' &&
          this.phase !== 'finished'
        )
          this.finish(false, false, true);
        this.publish();
      }, 1000);
  };
  dispose = () => {
    this.generation += 1;
    this.mounted = false;
    this.cancelLoad?.();
    this.editPermissionSubscription?.unsubscribe();
    this.editPermissionSubscription = undefined;
    clearInterval(this.interval);
  };
  preload = () => {
    if (!this.preloadEnabled || !this.current) return;
    return scheduleSessionPreload(() => ({
      cards: this.options.isSimpleMode
        ? this.simpleQueue.filter((card) => !this.simpleMastered.has(card.id))
        : this.cards,
      currentId: this.current!.id,
      context: this.options.isSimpleMode ? null : this.ctx,
      cooldowns: this.cooldowns,
      occlusions: this.occlusionMap,
    }));
  };
  private load = () => {
    this.machineState = emptySessionState();
    // Restarting after disposal must not reuse the previous session.
    this.lastAnswer = null;
    this.lastIntroduction = null;
    this.lessonChoiceSource = null;
    this.submitting = false;
    this.resetCompletion();
    this.progressBefore = 0;
    this.progressCache = { dirty: true, value: 0 };
    this.perf = new Map();
    this.schedulingUnits = new Map();
    this.schedulingConfig = null;
    this.ctx = null;
    this.linesModeMap = new Map();
    this.occlusionMap = new Map();
    this.lessonExposureId = null;
    this.lessonHasMembers = false;
    this.practiceSession = null;
    this.revisionPlan = null;
    this.revisionInitialRevision = 0;
    this.revisionWindowStartedAt = 0;
    this.reviewsByDeck = new Map();
    this.reviewsDayStart = 0;
    this.canUndo = false;
    this.summary = null;
    this.editing = false;
    this.options.onSessionReset?.();
    this.schedulerProgress = 0;
    this.serveableCardCount = 0;
    this.revisionSecondsRemaining = 0;
    this.revisionWindowBudgetSeconds = 0;
    this.revisionNextWindowDay = undefined;
    this.limitOverride = false;
    this.timeLimitOverride = false;
    this.sessionStartMs = 0;
    this.phase = 'loading';
    this.reviewKind = 'scheduling-unit';
    this.ratchetCourseId = null;
    this.ratchetLessonId = null;
    this.unitDisplayName = null;
    this.resolvedCourseId = null;
    this.lessonNotesScreen = null;
    this.selectCurrent(null);
    this.publish();
    if (!(this.options.enabled ?? true)) return;
    return startSessionLoad(
      this.options,
      { isGlobal: this.isGlobal, simpleSessionScope: this.simpleSessionScope },
      {
        redirect: (path) => {
          if (this.options.onFlowExit) this.options.onFlowExit();
          else void this.options.navigate(path);
        },
        source: (source) => {
          this.resolvedCourseId = source.resolvedCourseId;
          this.lessonHasMembers = source.lessonHasMembers;
          this.reviewKind = source.reviewKind;
          this.ratchetCourseId = source.ratchetCourseId;
          this.ratchetLessonId = source.ratchetLessonId;
          this.lessonExposureId = source.lessonExposureId;
          this.unitDisplayName = source.unitDisplayName;
          this.revisionPlan = source.revisionPlan;
          this.revisionInitialRevision = source.revisionInitialRevision;
          this.revisionWindowStartedAt = source.revisionWindowStartedAt;
          this.revisionWindowBudgetSeconds = source.revisionWindowBudgetSeconds;
          this.revisionSecondsRemaining = source.revisionSecondsRemaining;
          this.revisionNextWindowDay = source.revisionNextWindowDay;
          this.practiceSession = source.practiceSession;
          this.publish();
        },
        ready: (source, data, markLoad) => {
          const outcomes = data.simple?.outcomes ?? new Map<string, SessionCardOutcome>();
          this.machineState = {
            ...this.machineState,
            cards: data.cards,
            introduction: data.introduction,
            cardIds: (data.simple?.queue ?? data.cards).map((card) => card.id),
            events: data.simple?.events ?? [],
            outcomes,
            simple: {
              queue: data.simple?.queue ?? [],
              mastered: data.simple?.mastered ?? new Set(),
              wrong: data.simple?.wrong ?? new Set(),
              outcomes,
            },
          };
          if ((this.options.introduceNewCards ?? false) && this.options.lessonId)
            this.lessonChoiceSource = {
              lessonId: this.options.lessonId,
              cards: data.lessonChoiceCards,
            };
          this.perf = data.performance;
          this.schedulingUnits = data.schedulingUnits;
          this.schedulingConfig = data.schedulingConfig;
          this.ctx = data.context;
          this.answerModeLessons = data.answerModeLessons;
          this.linesModeMap = data.linesMode;
          this.occlusionMap = data.occlusions;
          this.progressBefore = data.progressBefore;
          this.schedulerProgress = data.schedulerProgress;
          this.serveableCardCount = data.serveableCardCount;
          this.reviewsDayStart = data.reviewsDayStart;
          this.reviewsByDeck = data.reviewsByDeck;
          this.limitOverride = false;
          const nextDeck = !this.isGlobal ? source.units[0] : null;
          if (this.singleDeck?.id !== nextDeck?.id) this.singleDeck = nextDeck;
          if (data.simple) this.recitation.steps = data.simple.recitations;
          if (data.entry.type === 'notes') {
            this.lessonNotesScreen = data.entry.screen;
            this.phase = 'notes';
            this.publish();
          } else if (data.entry.type === 'summary') {
            this.finaliseSummary(data.entry.summary);
          } else {
            if (!source.firstStudyLessonId || !source.firstStudyLessonName) {
              markLoad('serve-start');
              this.sessionStartMs = this.revisionWindowStartedAt || Date.now();
            }
            this.serveNext();
            if (!source.firstStudyLessonId || !source.firstStudyLessonName) markLoad('serve-end');
          }
        },
      },
    );
  };

  private reviewSessionId: string;

  private get sessionScope() {
    return (() =>
      resolveLearnSessionScope({
        courseId: this.options.courseId,
        lessonId: this.options.lessonId,
        sessionId: this.options.sessionId,
        tagFilter: this.options.tagFilter,
        // Pass the original arrays: deriving them from the serialised identities turns
        // an empty scope into [''] (''.split('\0')), which persists under a different
        // Simple-resume key than the loading effect's empty set. The identities stay
        // as memo dependencies only.
        filterParams: this.options.filterParams,
        requestScopeLessonIds: this.options.requestScopeLessonIds,
        practiceNodeKey: this.options.practiceNodeKeyParam,
        assessmentId: this.options.requestAssessmentId,
        planId: this.options.requestPlanId,
        windowId: this.options.requestWindowId,
      }))();
  }

  private get isLessonScoped() {
    return this.sessionScope.isLessonScoped;
  }

  private get isCourseScoped() {
    return this.sessionScope.isCourseScoped;
  }

  private get isGlobal() {
    return this.sessionScope.isGlobal;
  }

  private get curricularSimpleScope() {
    return this.sessionScope.simpleSessionScope;
  }

  private get simpleSessionScope() {
    return (() =>
      (this.options.standaloneSimple ?? false)
        ? { ...this.curricularSimpleScope, standalone: true }
        : this.curricularSimpleScope)();
  }

  private machineState: SessionState = emptySessionState();

  private phase: Phase = 'loading';

  private singleDeck: StudyUnit | null = null;

  private unitDisplayName: string | null = null;

  private resolvedCourseId: string | null = null;

  private lessonNotesScreen: LessonNotesScreen | null = null;

  private answerModeLessons: Map<string, Lesson> = new Map();

  private current: Card | null = null;
  private selectCurrent = (value: Card | null) => {
    const previous = this.current;
    this.current = value;
    if (
      previous?.id !== this.current?.id ||
      previous?.courseId !== this.current?.courseId ||
      previous?.sequenceItemId !== this.current?.sequenceItemId ||
      previous?.occlusionRegionId !== this.current?.occlusionRegionId
    )
      this.watchEditPermission();
  };

  private canEditCurrent = false;
  private editPermissionSubscription: Subscription | undefined;
  private watchEditPermission = () => {
    this.editPermissionSubscription?.unsubscribe();
    this.editPermissionSubscription = undefined;
    this.canEditCurrent = false;
    const card = this.current;
    if (!card || card.sequenceItemId !== undefined || card.occlusionRegionId !== undefined) return;
    const generation = this.generation;
    this.editPermissionSubscription = liveQuery(async () => {
      const course = card.courseId ? await db.courses.get(card.courseId) : undefined;
      return card.courseId ? Boolean(course && canEditLessons(course)) : true;
    }).subscribe((editable) => {
      if (!this.mounted || generation !== this.generation || this.current?.id !== card.id) return;
      this.canEditCurrent = editable;
      this.publish();
    });
  };

  private lessonChoiceSource: {
    lessonId: string;
    cards: Card[];
  } | null = null;

  private updateLessonChoiceCard = (updated: Card) => {
    const source = this.lessonChoiceSource;
    if (source)
      this.lessonChoiceSource = {
        ...source,
        cards: source.cards.map((card) => (card.id === updated.id ? updated : card)),
      };
  };

  private introductionPresentation: {
    serial: number;
    stage: ReturnType<typeof introductionStage>;
  } = { serial: 0, stage: undefined };

  private introductionCursor = { ...this.introductionPresentation, checked: false };

  private lastIntroduction: { machine: SessionState; card: Card } | null = null;

  private presentIntroduction = (card: Card) => {
    const stage = introductionStage(this.machineState.introduction, card.id);
    const next = {
      serial: this.introductionPresentation.serial + 1,
      stage: stage && canIntroduceCard(card) ? stage : undefined,
    };
    this.introductionCursor = { ...next, checked: false };
    this.introductionPresentation = next;
  };

  private linesModeMap: Map<string, Sequence> = new Map();

  private occlusionMap: Map<string, OcclusionCardData> = new Map();

  private hintStep: 0 | 1 | 2 = 0;
  private setHintStep = (value: 0 | 1 | 2 | ((previous: 0 | 1 | 2) => 0 | 1 | 2)) => {
    this.hintStep = typeof value === 'function' ? value(this.hintStep) : value;
    this.publish();
  };

  private get currentOcclusionData() {
    return this.current !== null ? (this.occlusionMap.get(this.current!.id) ?? null) : null;
  }

  private presentedAnswerInput: AnswerResponse['input'] = undefined;

  private get answerLesson() {
    return this.answerModeLessons.get(this.options.lessonId ?? this.current?.primaryLessonId ?? '');
  }

  private get lessonAnswerMode() {
    return this.answerLesson?.answerMode;
  }

  private get lessonRequiresCorrectSpelling() {
    return this.answerLesson?.requireCorrectSpelling;
  }

  private get occlusionAnswerText() {
    return this.currentOcclusionData?.answerText;
  }

  private typingCache: { inputs: unknown[]; value: boolean } | undefined;
  private get isTypingCard() {
    const inputs = [
      this.current,
      this.introductionPresentation.stage,
      this.lessonAnswerMode,
      this.options.answerInputPreference,
      this.occlusionAnswerText,
    ];
    if (
      this.typingCache &&
      inputs.every((value, index) => value === this.typingCache!.inputs[index])
    )
      return this.typingCache.value;
    const value =
      !!this.current &&
      (this.introductionPresentation.stage
        ? this.introductionPresentation.stage === 'recall'
        : resolveAnswerMode(
            this.current,
            this.lessonAnswerMode,
            this.options.answerInputPreference,
            this.occlusionAnswerText,
          ) === 'type');
    this.typingCache = { inputs, value };
    return value;
  }

  private get isMachineMarkedCard() {
    return hasMachineMarkedPayload(this.current);
  }

  private get hasUnrenderableItemPayload() {
    return isUnrenderableItemPayload(this.current);
  }

  private get isLinesModeCard() {
    return this.current !== null && this.linesModeMap.has(this.current!.id);
  }

  private progressCache: { dirty: boolean; value: number } = { dirty: true, value: 0 };

  private summary: SessionSummary | null = null;

  private canUndo: boolean = false;

  private editing: boolean = false;

  private get simpleQueue() {
    return this.machineState.simple.queue;
  }

  private get simpleMastered() {
    return this.machineState.simple.mastered;
  }

  private get sessionCardIds() {
    return this.machineState.cardIds;
  }

  private get sessionCardOutcomes() {
    return this.machineState.outcomes;
  }

  private schedulerProgress: number = 0;

  private serveableCardCount: number = 0;

  private revisionSecondsRemaining: number = 0;

  private revisionWindowBudgetSeconds: number = 0;

  private revisionNextWindowDay: string | undefined = undefined;

  private get simpleProgress() {
    return (() => {
      if (this.sessionCardIds.length === 0) return 0;
      let completed = 0;
      this.sessionCardIds.forEach((id) => {
        if (this.sessionCardOutcomes.get(id) === 'correct') completed += 1;
      });
      return completed / this.sessionCardIds.length;
    })();
  }

  private get cooldowns() {
    return this.machineState.cooldowns;
  }

  private perf: Map<string, UserPerformance> = new Map();

  private schedulingUnits: Map<string, StudyUnit> = new Map();

  private schedulingConfig: SessionSchedulingConfig | null = null;

  private ctx: SessionContext | null = null;

  private reviewKind: 'scheduling-unit' | 'course' = 'scheduling-unit';

  private ratchetCourseId: string | null = null;

  private ratchetLessonId: string | null = null;

  private get cards() {
    return this.machineState.cards;
  }

  private createSimpleQueue = (cards: Card[]) => shuffledSimpleQueue(cards, this.linesModeMap);

  private lessonExposureId: string | null = null;

  private lessonHasMembers = false;

  private practiceSession: PracticeSession | null = null;

  private revisionPlan: RevisionPlan | null = null;

  private revisionInitialRevision = 0;

  private revisionWindowStartedAt = 0;

  private get revisionSession() {
    return this.machineState.revision;
  }

  private get introduction() {
    return this.machineState.introduction;
  }

  private get masteredInPass() {
    return this.simpleMastered;
  }

  private get cardCompletion() {
    return (() =>
      this.introduction &&
      introductionProgress(this.introduction, this.sessionCardIds, this.masteredInPass))();
  }

  private timerStart = 0;

  private responseTime = 0;

  private pausedElapsed = 0;

  private get events() {
    return this.machineState.events;
  }

  private progressBefore = 0;

  private lastAnswer: AnswerSnapshot | null = null;

  private submitting = false;

  private pendingReviewEventId: string | null = null;

  private reviewsByDeck: Map<string, number> = new Map();

  private reviewsDayStart = 0;

  private limitOverride: boolean = false;

  private timeLimitOverride: boolean = false;

  private sessionStartMs = 0;

  private mounted = true;

  private applySessionEvent = (event: SessionEventInput) => {
    const transition = transitionSession(this.machineState, event);
    this.machineState = transition.state;
    return transition.effects;
  };

  private advanceTimer = (event: Parameters<typeof transitionResponseTimer>[1]) => {
    const next = transitionResponseTimer(
      {
        startedAt: this.timerStart,
        responseSeconds: this.responseTime,
        pausedElapsed: this.pausedElapsed,
      },
      event,
    );
    this.timerStart = next.startedAt;
    this.responseTime = next.responseSeconds;
    this.pausedElapsed = next.pausedElapsed;
  };

  private get exitTo() {
    return this.isLessonScoped
      ? this.resolvedCourseId
        ? `/course/${this.resolvedCourseId}/lesson/${this.options.lessonId}`
        : '/'
      : this.isCourseScoped
        ? `/course/${this.options.courseId}`
        : '/';
  }

  private backOut = () => {
    if (this.options.onFlowExit) this.options.onFlowExit();
    else this.options.leaveFlow(this.exitTo);
  };

  private persistSimpleResume = (
    outcomes: Map<string, SessionCardOutcome> = this.sessionCardOutcomes,
  ) => {
    if (!this.options.isSimpleMode) return;
    saveSimpleSession(this.simpleSessionScope, {
      queueCardIds: this.simpleQueue.map((card) => card.id),
      masteredCardIds: [...this.simpleMastered],
      outcomes,
      events: this.events,
      recitations: this.recitation.steps,
      introduction: this.machineState.introduction,
    });
  };

  private objectiveLabel = () => {
    if (this.options.isSimpleMode) return 'Cards correct in this pass';
    if (this.singleDeck) return progressHeading(this.singleDeck);
    return 'Predicted readiness across all courses';
  };

  private cachedSessionProgress = (cards: Card[], ctx: SessionContext): number => {
    if (!this.progressCache.dirty) {
      return this.progressCache.value;
    }
    const value = sessionProgress(cards, ctx);
    this.progressCache = { dirty: false, value };
    return value;
  };

  private persistPracticeMilestone = async (cards: Card[], completed: boolean): Promise<void> => {
    await persistSessionPracticeMilestone(this.practiceSession, cards, completed);
  };

  private readCompletionGuards = () => ({
    mounted: this.mounted,
    submitting: this.submitting,
    retainUndo: this.lastAnswer?.retainOnCompletion === true,
  });

  private clearCompletionUndo = () => {
    this.lastAnswer = null;
    if (this.mounted) this.canUndo = false;
  };

  private presentCompletion = (nextSummary: SessionSummary, confirmed: boolean) => {
    this.summary = nextSummary;
    this.phase = 'finished';
    this.publish();
    if (confirmed) this.options.onStepFinished?.(nextSummary);
  };

  private reportCompletionError = (cause: unknown, retry: () => void) => {
    const message = cause instanceof Error ? cause.message : 'Could not finish the study window.';
    if (this.options.quietCardPractice ?? false) {
      this.options.notify(message, 'negative', {
        actionLabel: 'Retry',
        onAction: retry,
        replaceKey: 'learn-answer',
        keepVisible: true,
      });
    } else this.options.notify(message, 'negative');
  };

  private persistCompletion = async (nextSummary: SessionSummary): Promise<SessionSummary> => {
    const generation = this.generation;
    const { deliveredSummary, completedPlan } = await persistSessionCompletion(
      nextSummary,
      this.options.requestWindowId,
      () => ({
        revisionPlan: this.revisionPlan,
        initialRevision: this.revisionInitialRevision,
        sessionId: this.reviewSessionId,
        startedAt: this.revisionWindowStartedAt,
        covered: this.revisionSession.covered,
        improved: this.revisionSession.improved,
        parked: this.revisionSession.parked,
        reviewEventIds: this.revisionSession.reviewEventIds,
        context: this.ctx,
        cards: this.cards,
        practice: this.practiceSession,
        ratchetCourseId: this.ratchetCourseId,
        ratchetLessonId: this.ratchetLessonId,
      }),
    );
    if (!this.mounted || generation !== this.generation) return deliveredSummary;
    this.revisionPlan = completedPlan;
    if (this.options.isSimpleMode && deliveredSummary.reachedGoal)
      clearSimpleSession(this.simpleSessionScope);
    return deliveredSummary;
  };

  private completion = createSessionCompletion({
    read: this.readCompletionGuards,
    persist: this.persistCompletion,
    present: this.presentCompletion,
    clearUndo: this.clearCompletionUndo,
    reportError: this.reportCompletionError,
    setProgress: (value) => {
      this.schedulerProgress = value;
    },
  });

  private confirmCompletion = this.completion.confirm;

  private settleCompletion = this.completion.settle;

  private finaliseSummary = this.completion.propose;

  private beginCompletionPass = this.completion.beginPass;

  private resetCompletion = this.completion.reset;

  private finish = (
    reachedGoal: boolean,
    limitReached = false,
    timeLimitReached = false,
    dailyGoalReached = false,
    blockComplete = false,
  ) => {
    if (!this.mounted) return;
    const ctx = this.ctx;
    const total = this.options.distraction.sessionMs();
    const focus =
      total <= 0
        ? 1
        : Math.max(0, Math.min(1, (total - this.options.distraction.blurredMs()) / total));
    const masteryBefore = this.options.isSimpleMode ? 0 : this.progressBefore;
    const masteryAfter = this.options.isSimpleMode
      ? this.cards.length > 0
        ? this.simpleMastered.size / this.cards.length
        : 0
      : ctx
        ? this.cachedSessionProgress(this.cards, ctx)
        : this.progressBefore;
    this.finaliseSummary({
      events: this.events,
      masteryBefore,
      masteryAfter,
      objectiveLabel: this.objectiveLabel(),
      focusFraction: focus,
      reachedGoal,
      limitReached,
      timeLimitReached,
      ...(dailyGoalReached ? { dailyGoalReached } : {}),
      ...(blockComplete ? { blockComplete } : {}),
      simpleMode: this.options.isSimpleMode,
      mode: this.options.mode,
    });
  };

  private serveNext = () => {
    if (!this.mounted) return;
    // Keep studying starts a new pass after the previous report was committed.
    this.beginCompletionPass();
    this.presentedAnswerInput = undefined;
    const effects = this.applySessionEvent({
      type: 'next',
      selection: {
        simple: this.options.isSimpleMode,
        context: this.ctx,
        now: Date.now(),
        reviewLimit: this.options.requestReviewLimit,
        revisionPlan: this.revisionPlan,
        windowId: this.options.requestWindowId,
        windowStartedAt: this.revisionWindowStartedAt,
        performance: this.perf,
      },
    });
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist-resume':
          this.persistSimpleResume();
          break;
        case 'finish':
          this.finish(
            effect.stop[0],
            effect.stop[1],
            effect.stop[2],
            effect.stop[3],
            effect.blockComplete,
          );
          break;
        case 'present-card':
          this.selectCurrent(effect.card);
          if ((this.options.introduceNewCards ?? false) || this.introductionPresentation.stage)
            this.presentIntroduction(effect.card);
          this.phase = 'question';
          this.options.onCardServed?.();
          this.hintStep = 0;
          this.pendingReviewEventId = null;
          this.advanceTimer({ type: 'start', now: performance.now() });
          this.options.distraction.beginCard();
          this.options.distraction.setAnswerVisible(false);
          if (effect.invalidateProgress) this.progressCache.dirty = true;
          break;
      }
    }
    this.publish();
  };

  private checkIntroduction = (serial: number, correct: boolean) => {
    const presentation = this.introductionCursor;
    const card = this.current;
    if (
      !card ||
      presentation.stage !== 'familiarise' ||
      presentation.checked ||
      presentation.serial !== serial ||
      this.submitting
    )
      return false;
    presentation.checked = true;
    this.lastIntroduction = { machine: snapshotSession(this.machineState), card };
    this.lastAnswer = null;
    this.applySessionEvent({ type: 'introduction-checked', card, correct });
    this.canUndo = true;
    this.persistSimpleResume();
    this.publish();
    return true;
  };

  private continueIntroduction = (serial: number) => {
    const presentation = this.introductionCursor;
    if (presentation.serial !== serial || !presentation.checked) return;
    this.serveNext();
  };

  private continueStudying = () => {
    if (this.summary?.simpleMode) {
      // A repeat pass practises the learned material in its ordinary answer format.
      this.lastIntroduction = null;
      this.applySessionEvent({
        type: 'begin-pass',
        queue: this.createSimpleQueue(
          this.cards.filter((c) => !c.suspended && !(c.buriedUntil && c.buriedUntil > Date.now())),
        ),
      });
      this.progressBefore = 0;
      this.sessionStartMs = Date.now();
      this.summary = null;
      this.serveNext();
    } else {
      const ctx = this.ctx;
      if (!ctx) return;
      this.applySessionEvent({ type: 'begin-pass' });
      this.progressBefore = this.cachedSessionProgress(this.cards, ctx);
      this.summary = null;
      this.limitOverride = true;
      this.timeLimitOverride = true;
      this.serveNext();
    }
  };

  private get preloadEnabled() {
    return (this.options.enabled ?? true) && (this.phase === 'question' || this.phase === 'answer');
  }

  private continueFromNotes = async (): Promise<void> => {
    const generation = this.generation;
    if (this.options.lessonId && this.cards.length === 0 && !this.lessonHasMembers) {
      await markLessonComplete(this.options.lessonId);
      if (!this.mounted || generation !== this.generation) return;
      this.lessonNotesScreen = null;
      this.finish(true);
      return;
    }
    this.lessonNotesScreen = null;
    this.serveNext();
  };

  private reveal = () => {
    if (this.phase === 'question') {
      const card = this.current;
      if (card)
        this.presentedAnswerInput = reviewAnswerInput(
          card,
          this.recitation.sequence !== null,
          this.isTypingCard,
        );
      this.advanceTimer({ type: 'reveal', now: performance.now() });
      this.phase = 'answer';
    }
    this.options.distraction.setAnswerVisible(true);
    this.publish();
  };

  private revealRecitation = (lines: number) => {
    if (this.phase !== 'question') return;
    this.presentedAnswerInput = undefined;
    this.advanceTimer({ type: 'reveal', now: performance.now(), lines });
    this.phase = 'answer';
    this.options.distraction.setAnswerVisible(true);
    this.publish();
  };

  private hide = () => {
    if (this.phase === 'answer') this.phase = 'question';
    this.options.distraction.setAnswerVisible(false);
    this.publish();
  };

  private undoLast = async (options?: { reveal?: boolean }) => {
    const recognition = this.lastIntroduction;
    if (!recognition) {
      const restored = await this.undoRecordedAnswer(options);
      return restored;
    }
    if (this.submitting) return;
    this.applySessionEvent({
      type: 'restore',
      snapshot: recognition.machine,
      card: recognition.card,
    });
    this.lastIntroduction = null;
    this.canUndo = false;
    this.selectCurrent(recognition.card);
    this.presentIntroduction(recognition.card);
    this.phase = 'question';
    this.options.onCardServed?.();
    this.presentedAnswerInput = undefined;
    this.options.distraction.beginCard();
    this.options.distraction.setAnswerVisible(false);
    this.persistSimpleResume();
    this.publish();
    return recognition.card;
  };

  private answer = async (
    input: AnswerInput,
    options?: {
      markedBy?: JevMarkProvenance;
      typedAnswer?: string;
      /** Automatic typed verdicts retain Undo through the final report. */
      retainUndo?: boolean;
    },
  ): Promise<
    AnswerResult & {
      completionPending?: true;
    }
  > => {
    if (!this.mounted || this.submitting) return { undoAvailable: false };
    const generation = this.generation;
    this.submitting = true;
    const phaseNow = this.phase;
    const cardNow = this.current;
    const machineMarked = typeof input === 'object' ? input : null;
    if (
      (!machineMarked && phaseNow !== 'answer') ||
      (machineMarked && phaseNow !== 'question') ||
      !cardNow ||
      this.introductionPresentation.stage === 'familiarise' ||
      isUnrenderableItemPayload(cardNow)
    ) {
      this.submitting = false;
      return { undoAvailable: false };
    }
    try {
      const verifiedRecall = this.introductionPresentation.stage === 'recall';
      const typedAnswer = options?.typedAnswer ?? '';
      const markedBy = !verifiedRecall || typedAnswer.trim() ? options?.markedBy : undefined;
      // A fallback self-mark is the learner's decision, just as in ordinary review.
      const correct = answerCorrect(input);
      const response: AnswerResponse = {
        retainUndo: options?.retainUndo ?? verifiedRecall,
        input: reviewAnswerInput(
          cardNow,
          this.recitation.sequence !== null,
          this.presentedAnswerInput === 'typed',
        ),
        markedBy,
        correct,
        manualGrade: typeof input === 'number' ? input : null,
        machineMarked,
        t: machineMarked ? (performance.now() - this.timerStart) / 1000 : this.responseTime,
        distracted: this.options.distraction.wasDistracted(),
      };
      const result = await this.recordAnswer(cardNow, response);
      if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
      if (this.options.isSimpleMode) this.lastIntroduction = null;
      return this.completion.pending && result.undoAvailable
        ? { ...result, completionPending: true }
        : result;
    } finally {
      if (generation === this.generation) this.submitting = false;
    }
  };

  private afterRemoval = (updated: Card) => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.mounted) return;
    this.canUndo = false;
    this.lastAnswer = null;
    this.lastIntroduction = null;
    this.updateLessonChoiceCard(updated);
    this.applySessionEvent({
      type: 'remove-card',
      card: updated,
      simple: this.options.isSimpleMode,
    });
    this.progressCache.dirty = true;
    this.schedulerProgress = sessionCompletionProgress(this.cards, ctx, this.sessionCardOutcomes);
    const hasRemainingCards = this.options.isSimpleMode
      ? this.simpleQueue.some((card) => !this.simpleMastered.has(card.id))
      : sessionServePool(this.cards, ctx).length > 0;
    if (!hasRemainingCards) {
      this.finish(false);
      return;
    }
    this.serveNext();
  };

  private suspendCurrent = async () => {
    const card = this.current;
    const generation = this.generation;
    if (!this.mounted || !card) return;
    try {
      await suspendCard(card.id);
      if (!this.mounted || generation !== this.generation) return;
      this.afterRemoval({ ...card, suspended: true });
    } catch (err) {
      if (!this.mounted || generation !== this.generation) return;
      this.options.notify(
        err instanceof Error ? err.message : 'Could not suspend the card.',
        'negative',
      );
    }
  };

  private buryCurrent = async () => {
    const card = this.current;
    const generation = this.generation;
    if (!this.mounted || !card) return;
    try {
      const until = startOfDay(Date.now()) + MS_PER_DAY;
      await buryCard(card.id, until);
      if (!this.mounted || generation !== this.generation) return;
      this.afterRemoval({ ...card, buriedUntil: until });
    } catch (err) {
      if (!this.mounted || generation !== this.generation) return;
      this.options.notify(
        err instanceof Error ? err.message : 'Could not bury the card.',
        'negative',
      );
    }
  };

  private openEdit = () => {
    if (!this.current || !this.canEditCurrent) return;
    // Guard against the card having been removed from the session pool
    // (deleted / suspended by another tab) since the last render.
    if (!this.cards.some((c) => c.id === this.current!.id)) return;
    // Only the question phase has a running timer; the answer phase already
    // captured responseTime at reveal, so there is nothing to pause there.
    if (this.phase === 'question') {
      this.advanceTimer({ type: 'pause', now: performance.now() });
    }
    this.editing = true;
    this.publish();
  };

  private resumeAfterEdit = () => {
    if (this.phase === 'question') {
      this.advanceTimer({ type: 'resume', now: performance.now() });
    }
  };

  private cancelEdit = () => {
    this.editing = false;
    this.resumeAfterEdit();
    this.publish();
  };

  private handleEdited = async (updated: Card) => {
    const generation = this.generation;
    if (!this.mounted || this.current?.id !== updated.id) return;
    const previous = this.cards.find((card) => card.id === updated.id);
    const partnerId = previous?.reverseCardId ?? updated.reverseCardId;
    const queuedPartner = this.cards.find((card) => card.id === partnerId);
    const storedPartner = queuedPartner ? await db.cards.get(queuedPartner.id) : undefined;
    if (!this.mounted || generation !== this.generation || this.current?.id !== updated.id) return;
    // Restore before removing a converted partner, so the recognition snapshot cannot resurrect it.
    const recognition = this.lastIntroduction;
    const restoreIntroduction =
      this.options.introduceNewCards &&
      this.introductionPresentation.stage === 'familiarise' &&
      recognition?.card.id === updated.id &&
      this.introductionCursor.checked;
    if (restoreIntroduction) {
      this.applySessionEvent({ type: 'restore', snapshot: recognition.machine, card: updated });
      this.lastIntroduction = null;
      this.canUndo = false;
    }
    if (queuedPartner) {
      if (storedPartner) {
        const partner = { ...storedPartner, history: queuedPartner.history };
        this.applySessionEvent({ type: 'replace-card', card: partner });
        this.updateLessonChoiceCard(partner);
      } else {
        this.applySessionEvent({
          type: 'remove-card',
          card: { ...queuedPartner, suspended: true },
          simple: this.options.isSimpleMode,
        });
      }
    }
    this.applySessionEvent({ type: 'replace-card', card: updated });
    this.selectCurrent(updated);
    if (this.options.introduceNewCards) {
      this.updateLessonChoiceCard(updated);
      if (this.introductionPresentation.stage === 'familiarise') {
        if (restoreIntroduction) this.persistSimpleResume();
        this.presentIntroduction(updated);
        this.phase = 'question';
      }
    }
    this.editing = false;
    this.resumeAfterEdit();
    this.publish();
  };

  private toggleFlagCurrent = async () => {
    const card = this.current;
    const generation = this.generation;
    if (!this.mounted || !card) return;
    try {
      const next = !card.flagged;
      await setCardFlag(card.id, next);
      if (!this.mounted || generation !== this.generation) return;
      const updated = { ...card, flagged: next };
      this.applySessionEvent({ type: 'replace-card', card: updated });
      if (this.current?.id === card.id) this.selectCurrent(updated);
      this.publish();
    } catch (err) {
      if (!this.mounted || generation !== this.generation) return;
      this.options.notify(
        err instanceof Error ? err.message : 'Could not update the card flag.',
        'negative',
      );
    }
  };

  private get editTagSuggestions() {
    return this.editing && this.current
      ? [
          ...new Set(
            this.cards
              .filter((c) => c.schedulingUnitId === this.current!.schedulingUnitId)
              .flatMap((c) => c.tags ?? []),
          ),
        ].sort()
      : [];
  }

  private answerUnit = (card: Card): StudyUnit | undefined =>
    this.isGlobal
      ? card.schedulingUnitId
        ? this.schedulingUnits.get(card.schedulingUnitId)
        : undefined
      : this.schedulingUnits.values().next().value;

  private recordAnswer = async (
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
    const generation = this.generation;
    const simple = this.options.isSimpleMode;
    const ctx = this.ctx;
    const deck = this.answerUnit(cardNow);
    const schedulingConfig = this.isGlobal ? deck : this.schedulingConfig;
    if (!deck || (!simple && (!ctx || !schedulingConfig))) return { undoAvailable: false };
    const perf = this.perf.get(deck.id);
    const hintUsed = this.hintStep > 0;
    const eventId = this.pendingReviewEventId ?? makeId();
    this.pendingReviewEventId = eventId;
    const effect = this.applySessionEvent({
      type: 'answer',
      simple,
      retainUndo,
      review: {
        card: cardNow,
        eventId,
        sessionId: this.reviewSessionId,
        sessionKind: this.options.reviewSessionKind,
        revisionPlanId: simple ? undefined : this.revisionPlan?.id,
        revisionWindowId: !simple && this.revisionPlan ? this.options.requestWindowId : undefined,
        deck,
        kind: this.reviewKind,
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
      grading: {
        machineMarked,
        manualGrade,
        correct,
        responseTimeSec: t,
        hintUsed,
        performance: perf,
      },
    }).find((effect) => effect.type === 'persist-review')!;
    const { result, nextPerf, snapshot, event } = await persistSessionAnswer(
      effect,
      perf,
      () => this.lessonExposureId,
    );
    if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
    if (nextPerf) this.perf.set(deck.id, nextPerf);
    const revisionWindow = this.revisionPlan?.windows.find(
      (candidate) => candidate.id === this.options.requestWindowId,
    );
    if (!simple) {
      const reviewNow = Date.now();
      const reviewDayStart = startOfDay(reviewNow);
      if (reviewDayStart !== this.reviewsDayStart) {
        this.reviewsByDeck = await dailyReviewCounts(result.kind, reviewNow);
        if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
        this.reviewsDayStart = reviewDayStart;
      } else if (result.recorded) {
        this.reviewsByDeck.set(deck.id, (this.reviewsByDeck.get(deck.id) ?? 0) + 1);
      }
      this.applySessionEvent({
        type: 'scheduled-recorded',
        card: result.card,
        event,
        eventId,
        recorded: result.recorded,
        deckId: deck.id,
        global: this.isGlobal,
        now: Date.now(),
        hasRevisionPlan: this.revisionPlan !== null,
        revisionWindowEndsAt:
          this.revisionPlan && this.options.requestWindowId
            ? revisionWindow
              ? this.revisionWindowStartedAt + revisionWindow.budgetMinutes * 60000
              : Date.now()
            : undefined,
      });
      this.schedulerProgress = sessionCompletionProgress(
        this.cards,
        ctx!,
        this.sessionCardOutcomes,
      );
      this.progressCache.dirty = true;
    }
    const deckReviews = this.reviewsByDeck.get(deck.id) ?? 0;
    const effects = this.applySessionEvent({
      type: 'answer-ready',
      snapshot: { ...snapshot, deckReviews },
      recorded: result.recorded,
      card: result.card,
      event,
      scheduled: simple
        ? null
        : {
            revision: this.revisionPlan !== null,
            context: ctx!,
            practice: this.practiceSession !== null,
            deckReviews,
            maxReviewsPerDay: schedulingConfig!.maxReviewsPerDay,
            dailyReviewGoal: schedulingConfig!.dailyReviewGoal,
            sessionTimeLimitMinutes: schedulingConfig!.sessionTimeLimitMinutes,
            limitOverride: this.limitOverride,
            timeLimitOverride: this.timeLimitOverride,
            revisionWindowEndsAt: revisionWindow
              ? this.revisionWindowStartedAt + revisionWindow.budgetMinutes * 60000
              : undefined,
            sessionStartMs: this.sessionStartMs,
            now: Date.now(),
          },
    });
    if (simple) this.pendingReviewEventId = null;
    // Course/lesson contexts hold one unit; global contexts key by scheduling-unit id.
    const sessionDeck = this.isGlobal ? ctx?.decks.get(deck.id) : ctx?.decks.values().next().value;
    const feedback = simple
      ? { undoAvailable: true }
      : answerFeedback({
          recorded: result.recorded,
          grade: event.grade,
          card: result.card,
          deck: sessionDeck?.deck ?? deck,
          examDateContext: sessionDeck?.oc.examDateContext,
        });
    await this.executeAnswerEffects(effects);
    if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
    return this.lastAnswer ? feedback : { undoAvailable: false };
  };

  private executeAnswerEffects = async (effects: SessionEffect[]) => {
    const generation = this.generation;
    const cards = this.cards;
    for (const effect of effects) {
      switch (effect.type) {
        case 'retain-undo':
          this.lastAnswer = effect.snapshot;
          this.canUndo = effect.snapshot !== null;
          break;
        case 'persist-resume':
          this.persistSimpleResume();
          break;
        case 'finish':
          this.finish(...effect.stop);
          break;
        case 'serve-next':
          this.serveNext();
          break;
        case 'persist-practice':
          if (!this.completion.pending) await this.persistPracticeMilestone(cards, false);
          break;
      }
      if (!this.mounted || generation !== this.generation) return;
    }
  };

  private recitation = new SessionRecitation({
    read: () => ({
      state: this.machineState,
      current: this.current,
      enabled: this.options.isSimpleMode,
      sequences: this.linesModeMap,
      exposureLessonId: this.lessonExposureId,
      generation: this.generation,
      mounted: this.mounted,
      review: {
        sessionId: this.reviewSessionId,
        sessionKind: this.options.reviewSessionKind,
        kind: this.reviewKind,
      },
    }),
    unitForCard: this.answerUnit,
    update: (state, publish) => {
      this.machineState = state;
      if (publish) this.publish();
    },
    persistResume: this.persistSimpleResume,
    publish: this.publish,
    serveNext: this.serveNext,
  });

  private undoRecordedAnswer = async (options?: { reveal?: boolean }) => {
    const generation = this.generation;
    const snap = this.lastAnswer;
    const ctx = this.ctx;
    if (!this.mounted || !snap || !ctx || this.submitting || this.completion.persisting) return;
    this.submitting = true;
    try {
      await undoSessionAnswer(snap.undo, snap.simple?.exposureAdded);
      if (!this.mounted || generation !== this.generation) return;
      const effects = this.applySessionEvent({ type: 'undo-recorded', snapshot: snap });
      this.schedulerProgress = sessionCompletionProgress(this.cards, ctx, this.sessionCardOutcomes);
      this.perf.set(snap.deckId, snap.undo.perfBefore ?? emptyPerformance(snap.deckId));
      for (const effect of effects) {
        if (effect.type === 'persist-resume') this.persistSimpleResume();
        if (effect.type !== 'restore-answer') continue;
        const { snapshot: restored, deckReviews } = effect;
        if (deckReviews > 0) this.reviewsByDeck.set(restored.deckId, deckReviews);
        else this.reviewsByDeck.delete(restored.deckId);
        this.completion.reset();
        this.summary = null;
        this.lastAnswer = null;
        this.canUndo = false;
        this.progressCache.dirty = true;
        this.selectCurrent(restored.undo.cardBefore);
        if (this.options.introduceNewCards) this.presentIntroduction(restored.undo.cardBefore);
        this.phase = options?.reveal ? 'answer' : 'question';
        this.options.onCardServed?.();
        this.hintStep = 0;
        this.pendingReviewEventId = null;
        this.timerStart = performance.now();
        this.options.distraction.beginCard();
        this.responseTime = restored.responseTimeSec;
        this.presentedAnswerInput = restored.input;
        this.options.distraction.setAnswerVisible(options?.reveal === true);
        this.publish();
        return restored.undo.cardBefore;
      }
    } catch (err) {
      this.options.notify(
        err instanceof Error ? err.message : 'Could not undo the last answer.',
        'negative',
      );
    } finally {
      if (generation === this.generation) this.submitting = false;
    }
  };
  private readSnapshot = () => ({
    exitTo: this.exitTo,
    phase: this.phase,
    singleDeck: this.singleDeck,
    unitDisplayName: this.unitDisplayName,
    lessonNotesScreen: this.lessonNotesScreen,
    continueFromNotes: this.continueFromNotes,
    current: this.current,
    lessonChoiceCards:
      (this.options.introduceNewCards ?? false) &&
      this.lessonChoiceSource?.lessonId === this.options.lessonId
        ? this.lessonChoiceSource?.cards
        : undefined,
    introductionPresentation: this.introductionPresentation,
    cardCompletion: this.cardCompletion,
    checkIntroduction: this.checkIntroduction,
    continueIntroduction: this.continueIntroduction,
    hintStep: this.hintStep,
    setHintStep: this.setHintStep,
    isTypingCard: this.isTypingCard,
    presentedAnswerInput: this.presentedAnswerInput,
    isMachineMarkedCard: this.isMachineMarkedCard,
    hasUnrenderableItemPayload: this.hasUnrenderableItemPayload,
    isLinesModeCard: this.isLinesModeCard,
    recitationSequence: this.recitation.sequence,
    recitationMasteredItemIds: this.recitation.masteredItemIds,
    savedRecitationStep: this.recitation.savedStep,
    saveRecitationStep: this.recitation.saveStep,
    currentCardIds: this.recitation.currentCardIds,
    setRecitationFocus: this.recitation.setFocus,
    answerRecitation: this.recitation.answer,
    revealRecitation: this.revealRecitation,
    occlusion: this.currentOcclusionData?.occlusion,
    occlusionAnswerText: this.currentOcclusionData?.answerText,
    lessonRequiresCorrectSpelling: this.lessonRequiresCorrectSpelling,
    summary: this.summary,
    canUndo: this.canUndo,
    editing: this.editing,
    editTagSuggestions: this.editTagSuggestions,
    sessionCardIds: this.sessionCardIds,
    sessionCardOutcomes: this.sessionCardOutcomes,
    reviewEvents: this.events,
    schedulerProgress: this.schedulerProgress,
    // The scheduler can retry a card or end the block early. Count known
    // reviews as they arrive, bounded by the same limit as card selection.
    reviewBlockSize:
      this.phase === 'finished'
        ? this.events.length
        : Math.min(
            this.options.requestReviewLimit ?? 0,
            Math.max(this.serveableCardCount, this.events.length + 1),
          ),
    predictedRecall:
      !this.options.isSimpleMode && !this.options.plannedRevision && this.ctx
        ? this.cachedSessionProgress(this.cards, this.ctx)
        : 0,
    simpleProgress: this.simpleProgress,
    revisionSecondsRemaining: this.revisionSecondsRemaining,
    revisionWindowBudgetSeconds: this.revisionWindowBudgetSeconds,
    revisionNextWindowDay: this.revisionNextWindowDay,
    backOut: this.backOut,
    continueStudying: this.continueStudying,
    reveal: this.reveal,
    hide: this.hide,
    answer: this.answer,
    undoLast: this.undoLast,
    confirmCompletion: this.confirmCompletion,
    settleCompletion: this.settleCompletion,
    canEditCurrent: this.canEditCurrent,
    openEdit: this.openEdit,
    cancelEdit: this.cancelEdit,
    handleEdited: this.handleEdited,
    toggleFlagCurrent: this.toggleFlagCurrent,
    suspendCurrent: this.suspendCurrent,
    buryCurrent: this.buryCurrent,
    persistSimpleResume: this.persistSimpleResume,
  });
}
