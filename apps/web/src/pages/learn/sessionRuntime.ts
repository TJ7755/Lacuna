import { liveQuery, type Subscription } from 'dexie';
import { canEditLessons } from '../../course/lessonViewMode';
import type { JevMarkProvenance } from '@lacuna/core/jev/types';
import { createRevisionSessionState } from '../../course/revisionSession';
import { type SessionCardOutcome, type SessionSummary } from '../../course/sessionSummary';

import { buryCard, setCardFlag, suspendCard } from '../../db/cardRepository';
import { markLessonComplete, upsertLessonCardExposure } from '../../db/lessonRepository';
import { type OcclusionCardData } from '../../db/occlusionStudy';
import { db, makeId } from '../../db/schema';

import { isLabelCardId } from '../../db/sequenceGeneration';
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
import {
  answerCorrect,
  type AnswerInput,
  type AnswerResult,
  answerFeedback,
  persistAnswer,
} from './answerSteps';
import { canIntroduceCard, introductionProgress, introductionStage } from './lessonIntroduction';
import { loadSessionData } from './loadSessionData';
import { loadSessionSource } from './loadSessionSource';
import { shuffledSimpleQueue } from './recitation/recitationFlow';
import {
  type AnswerSnapshot,
  persistRecitationReview,
  persistSimpleSessionAnswer,
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
  afterScheduledAnswer,
} from './sessionMachine';
import { preloadSessionImages, sessionPreloadCards } from './sessionPreload';
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
import type { UseLearnSessionParams } from './useLearnSession';
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

export interface SessionRuntimeOptions extends UseLearnSessionParams {
  answerInputPreference: Parameters<typeof resolveAnswerMode>[2];
  leaveFlow(fallback: string): void;
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
  private serving = false;
  private publish = () => {
    this.snapshot = undefined;
    if (this.serving) return;
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
        this.setRevisionSecondsRemaining(
          Math.max(
            0,
            this.revisionWindowBudgetSeconds - (Date.now() - this.revisionWindowStartedAt) / 1000,
          ),
        );
        if (
          this.revisionWindowBudgetSeconds > 0 &&
          this.revisionSecondsRemaining <= 0 &&
          this.phase !== 'loading' &&
          this.phase !== 'finished'
        )
          this.finish(false, false, true);
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
    let stopPreloading: (() => void) | undefined;
    let timeout: number | undefined;
    // Let the current face paint before speculative reads and decoding begin.
    const frame = window.requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        const pool = this.options.isSimpleMode
          ? this.simpleQueue.filter((card) => !this.simpleMastered.has(card.id))
          : this.cards;
        const upcoming = sessionPreloadCards(
          pool,
          this.current!.id,
          this.options.isSimpleMode ? null : this.ctx,
          this.cooldowns,
        );
        stopPreloading = preloadSessionImages(upcoming, this.occlusionMap);
      }, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      stopPreloading?.();
    };
  };
  private load = () => {
    let cancelled = false;
    this.machineState = emptySessionState();
    // Restarting after disposal must not reuse the previous session.
    this.cooldowns = new Map();
    this.events = [];
    this.lastAnswer = null;
    this.lastIntroduction = null;
    this.machineState = { ...this.machineState, introduction: undefined };
    this.setLessonChoiceSource(null);
    this.submitting = false;
    this.resetCompletion();
    this.progressBefore = 0;
    this.progressCache = { dirty: true, value: 0 };
    this.perf = new Map();
    this.schedulingUnits = new Map();
    this.schedulingConfig = null;
    this.ctx = null;
    this.cards = [];
    this.linesModeMap = new Map();
    this.occlusionMap = new Map();
    this.lessonExposureId = null;
    this.lessonHasMembers = false;
    this.practiceSession = null;
    this.revisionPlan = null;
    this.revisionInitialRevision = 0;
    this.revisionWindowStartedAt = 0;
    this.revisionSession = createRevisionSessionState();
    this.reviewsByDeck = new Map();
    this.reviewsDayStart = 0;
    this.setCanUndo(false);
    this.setSummary(null);
    this.setEditing(false);
    this.options.onSessionReset?.();
    this.setSessionCardIds([]);
    this.sessionCardOutcomes = new Map();
    this.setSessionCardOutcomes(this.sessionCardOutcomes);
    this.setSchedulerProgress(0);
    this.setServeableCardCount(0);
    this.setRevisionSecondsRemaining(0);
    this.setRevisionWindowBudgetSeconds(0);
    this.setRevisionNextWindowDay(undefined);
    this.setLimitOverride(false);
    this.setTimeLimitOverride(false);
    this.sessionStartMs = 0;
    this.setPhase('loading');
    this.reviewKind = 'scheduling-unit';
    this.ratchetCourseId = null;
    this.ratchetLessonId = null;
    this.setUnitDisplayName(null);
    this.setResolvedCourseId(null);
    this.setLessonNotesScreen(null);
    if (!(this.options.enabled ?? true)) return;
    void (async () => {
      const measureStartup =
        performance.getEntriesByName('lacuna:measure-study-startup').length > 0;
      const markLoad = (stage: string) => {
        if (measureStartup) performance.mark(`lacuna:study-load:${stage}`);
      };
      markLoad('load-start');
      const source = await loadSessionSource({
        lessonId: this.options.lessonId,
        courseId: this.options.courseId,
        standaloneSimple: this.options.standaloneSimple ?? false,
        requestScopeLessonIds: this.options.requestScopeLessonIds,
        requestSpecificationPointId: this.options.requestSpecificationPointId,
        practiceNodeKeyParam: this.options.practiceNodeKeyParam,
        requestAssessmentId: this.options.requestAssessmentId,
        filterParams: this.options.filterParams,
        examPractice: this.options.examPractice ?? false,
        catchUpPractice: this.options.catchUpPractice ?? false,
        plannedRevision: this.options.plannedRevision,
        requestPlanId: this.options.requestPlanId,
        requestWindowId: this.options.requestWindowId,
        requestMilestoneLessonIds: this.options.requestMilestoneLessonIds,
      });
      if (cancelled) return;
      if ('redirect' in source) {
        if (this.options.onFlowExit) this.options.onFlowExit();
        else void this.options.navigate(source.redirect);
        return;
      }
      this.setResolvedCourseId(source.resolvedCourseId);
      this.lessonHasMembers = source.lessonHasMembers;
      this.reviewKind = source.reviewKind;
      this.ratchetCourseId = source.ratchetCourseId;
      this.ratchetLessonId = source.ratchetLessonId;
      this.lessonExposureId = source.lessonExposureId;
      this.setUnitDisplayName(source.unitDisplayName);
      this.revisionPlan = source.revisionPlan;
      this.revisionInitialRevision = source.revisionInitialRevision;
      this.revisionWindowStartedAt = source.revisionWindowStartedAt;
      this.setRevisionWindowBudgetSeconds(source.revisionWindowBudgetSeconds);
      this.setRevisionSecondsRemaining(source.revisionSecondsRemaining);
      this.setRevisionNextWindowDay(source.revisionNextWindowDay);
      this.practiceSession = source.practiceSession;
      if (cancelled) return;
      markLoad('pool-ready');
      const data = await loadSessionData({
        source,
        tagFilter: this.options.tagFilter,
        filterParams: this.options.filterParams,
        lessonId: this.options.lessonId,
        plannedRevision: this.options.plannedRevision,
        isSimpleMode: this.options.isSimpleMode,
        introduceNewCards: this.options.introduceNewCards ?? false,
        isGlobal: this.isGlobal,
        mode: this.options.mode,
        simpleSessionScope: this.simpleSessionScope,
        markLoad,
      });
      if (cancelled) return;
      this.cards = data.cards;
      this.machineState = { ...this.machineState, introduction: data.introduction };
      if ((this.options.introduceNewCards ?? false) && this.options.lessonId)
        this.setLessonChoiceSource({
          lessonId: this.options.lessonId,
          cards: data.lessonChoiceCards,
        });
      this.perf = data.performance;
      this.schedulingUnits = data.schedulingUnits;
      this.schedulingConfig = data.schedulingConfig;
      this.ctx = data.context;
      this.answerModeLessons = data.answerModeLessons;
      this.linesModeMap = data.linesMode;
      this.occlusionMap = data.occlusions;
      this.progressBefore = data.progressBefore;
      this.setSchedulerProgress(data.schedulerProgress);
      this.setServeableCardCount(data.serveableCardCount);
      this.reviewsDayStart = data.reviewsDayStart;
      this.reviewsByDeck = data.reviewsByDeck;
      this.setLimitOverride(false);
      this.setSingleDeck((previous) => {
        const next = !this.isGlobal ? source.units[0] : null;
        return previous?.id === next?.id ? previous : next;
      });
      if (data.simple) {
        this.simpleQueue = data.simple.queue;
        this.simpleMastered = data.simple.mastered;
        this.simpleWrong = data.simple.wrong;
        this.events = data.simple.events;
        this.simpleRecitations = data.simple.recitations;
      }
      this.sessionCardOutcomes = data.simple?.outcomes ?? new Map();
      this.setSessionCardOutcomes(this.sessionCardOutcomes);
      this.setSessionCardIds((data.simple?.queue ?? data.cards).map((card) => card.id));
      if (data.entry.type === 'notes') {
        this.setLessonNotesScreen(data.entry.screen);
        this.setPhase('notes');
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
    })();
    return () => {
      cancelled = true;
    };
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
  private setPhase = (value: Phase | ((previous: Phase) => Phase)) => {
    this.phase = typeof value === 'function' ? value(this.phase) : value;
    this.publish();
  };

  private singleDeck: StudyUnit | null = null;
  private setSingleDeck = (
    value: StudyUnit | null | ((previous: StudyUnit | null) => StudyUnit | null),
  ) => {
    this.singleDeck = typeof value === 'function' ? value(this.singleDeck) : value;
    this.publish();
  };

  private unitDisplayName: string | null = null;
  private setUnitDisplayName = (
    value: string | null | ((previous: string | null) => string | null),
  ) => {
    this.unitDisplayName = typeof value === 'function' ? value(this.unitDisplayName) : value;
    this.publish();
  };

  private resolvedCourseId: string | null = null;
  private setResolvedCourseId = (
    value: string | null | ((previous: string | null) => string | null),
  ) => {
    this.resolvedCourseId = typeof value === 'function' ? value(this.resolvedCourseId) : value;
    this.publish();
  };

  private lessonNotesScreen: LessonNotesScreen | null = null;
  private setLessonNotesScreen = (
    value:
      LessonNotesScreen | null | ((previous: LessonNotesScreen | null) => LessonNotesScreen | null),
  ) => {
    this.lessonNotesScreen = typeof value === 'function' ? value(this.lessonNotesScreen) : value;
    this.publish();
  };

  private answerModeLessons: Map<string, Lesson> = new Map();

  private current: Card | null = null;
  private setCurrent = (value: Card | null | ((previous: Card | null) => Card | null)) => {
    const previous = this.current;
    this.current = typeof value === 'function' ? value(this.current) : value;
    if (
      previous?.id !== this.current?.id ||
      previous?.courseId !== this.current?.courseId ||
      previous?.sequenceItemId !== this.current?.sequenceItemId ||
      previous?.occlusionRegionId !== this.current?.occlusionRegionId
    ) this.watchEditPermission();
    this.publish();
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
  private setLessonChoiceSource = (
    value:
      | {
          lessonId: string;
          cards: Card[];
        }
      | null
      | ((
          previous: {
            lessonId: string;
            cards: Card[];
          } | null,
        ) => {
          lessonId: string;
          cards: Card[];
        } | null),
  ) => {
    this.lessonChoiceSource = typeof value === 'function' ? value(this.lessonChoiceSource) : value;
    this.publish();
  };

  private updateLessonChoiceCard = (updated: Card) => {
    this.setLessonChoiceSource(
      (source) =>
        source && {
          ...source,
          cards: source.cards.map((card) => (card.id === updated.id ? updated : card)),
        },
    );
  };

  private introductionPresentation: {
    serial: number;
    stage: ReturnType<typeof introductionStage>;
  } = { serial: 0, stage: undefined };
  private setIntroductionPresentation = (
    value:
      | {
          serial: number;
          stage: ReturnType<typeof introductionStage>;
        }
      | ((previous: { serial: number; stage: ReturnType<typeof introductionStage> }) => {
          serial: number;
          stage: ReturnType<typeof introductionStage>;
        }),
  ) => {
    this.introductionPresentation =
      typeof value === 'function' ? value(this.introductionPresentation) : value;
    this.publish();
  };

  private introductionCursor = { ...this.introductionPresentation, checked: false };

  private lastIntroduction: { machine: SessionState; card: Card } | null = null;

  private presentIntroduction = (card: Card) => {
    const stage = introductionStage(this.machineState.introduction, card.id);
    const next = {
      serial: this.introductionPresentation.serial + 1,
      stage: stage && canIntroduceCard(card) ? stage : undefined,
    };
    this.introductionCursor = { ...next, checked: false };
    this.setIntroductionPresentation(next);
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

  private get recitationSequence() {
    return this.current?.sequenceItemId && !isLabelCardId(this.current.sequenceItemId)
      ? (this.linesModeMap.get(this.current!.id) ?? null)
      : null;
  }

  private progressCache: { dirty: boolean; value: number } = { dirty: true, value: 0 };

  private summary: SessionSummary | null = null;
  private setSummary = (
    value: SessionSummary | null | ((previous: SessionSummary | null) => SessionSummary | null),
  ) => {
    this.summary = typeof value === 'function' ? value(this.summary) : value;
    this.publish();
  };

  private canUndo: boolean = false;
  private setCanUndo = (value: boolean | ((previous: boolean) => boolean)) => {
    this.canUndo = typeof value === 'function' ? value(this.canUndo) : value;
    this.publish();
  };

  private editing: boolean = false;
  private setEditing = (value: boolean | ((previous: boolean) => boolean)) => {
    this.editing = typeof value === 'function' ? value(this.editing) : value;
    this.publish();
  };

  private get simpleQueue() {
    return this.machineState.simple.queue;
  }
  private set simpleQueue(value: SessionState['simple']['queue']) {
    this.machineState = {
      ...this.machineState,
      simple: { ...this.machineState.simple, queue: value },
    };
  }

  private get simpleMastered() {
    return this.machineState.simple.mastered;
  }
  private set simpleMastered(value: SessionState['simple']['mastered']) {
    this.machineState = {
      ...this.machineState,
      simple: { ...this.machineState.simple, mastered: value },
    };
  }

  private get simpleWrong() {
    return this.machineState.simple.wrong;
  }
  private set simpleWrong(value: SessionState['simple']['wrong']) {
    this.machineState = {
      ...this.machineState,
      simple: { ...this.machineState.simple, wrong: value },
    };
  }

  private simpleRecitations: Map<string, unknown> = new Map();

  private get sessionCardIds() {
    return this.machineState.cardIds;
  }
  private set sessionCardIds(value: SessionState['cardIds']) {
    this.machineState = { ...this.machineState, cardIds: value };
  }

  private setSessionCardIds = (value: string[] | ((previous: string[]) => string[])) => {
    const next = typeof value === 'function' ? value(this.sessionCardIds) : value;
    this.sessionCardIds = next;
    this.publish();
  };

  private setSessionCardOutcomes = (value: Map<string, SessionCardOutcome>) => {
    this.sessionCardOutcomes = value;
    this.publish();
  };

  private get sessionCardOutcomes() {
    return this.machineState.outcomes;
  }
  private set sessionCardOutcomes(value: SessionState['outcomes']) {
    this.machineState = { ...this.machineState, outcomes: value };
    this.machineState.simple = { ...this.machineState.simple, outcomes: value };
  }

  private schedulerProgress: number = 0;
  private setSchedulerProgress = (value: number | ((previous: number) => number)) => {
    this.schedulerProgress = typeof value === 'function' ? value(this.schedulerProgress) : value;
    this.publish();
  };

  private serveableCardCount: number = 0;
  private setServeableCardCount = (value: number | ((previous: number) => number)) => {
    this.serveableCardCount = typeof value === 'function' ? value(this.serveableCardCount) : value;
    this.publish();
  };

  private revisionSecondsRemaining: number = 0;
  private setRevisionSecondsRemaining = (value: number | ((previous: number) => number)) => {
    this.revisionSecondsRemaining =
      typeof value === 'function' ? value(this.revisionSecondsRemaining) : value;
    this.publish();
  };

  private revisionWindowBudgetSeconds: number = 0;
  private setRevisionWindowBudgetSeconds = (value: number | ((previous: number) => number)) => {
    this.revisionWindowBudgetSeconds =
      typeof value === 'function' ? value(this.revisionWindowBudgetSeconds) : value;
    this.publish();
  };

  private revisionNextWindowDay: string | undefined = undefined;
  private setRevisionNextWindowDay = (
    value: string | undefined | ((previous: string | undefined) => string | undefined),
  ) => {
    this.revisionNextWindowDay =
      typeof value === 'function' ? value(this.revisionNextWindowDay) : value;
    this.publish();
  };

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
  private set cooldowns(value: SessionState['cooldowns']) {
    this.machineState = { ...this.machineState, cooldowns: value };
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
  private set cards(value: SessionState['cards']) {
    this.machineState = { ...this.machineState, cards: value };
  }

  private createSimpleQueue = (cards: Card[]) => shuffledSimpleQueue(cards, this.linesModeMap);

  private recitationFocus: string[] = [];
  private setRecitationFocus = (value: string[] | ((previous: string[]) => string[])) => {
    this.recitationFocus = typeof value === 'function' ? value(this.recitationFocus) : value;
    this.publish();
  };

  private get currentCardIds() {
    return (() => {
      if (!this.current) return [];
      if (!this.recitationSequence || !this.options.isSimpleMode) return [this.current!.id];
      const ids = this.cards.flatMap((card) =>
        card.sequenceItemId &&
        this.recitationFocus.includes(card.sequenceItemId) &&
        this.linesModeMap.get(card.id)?.id === this.recitationSequence!.id
          ? [card.id]
          : [],
      );
      return ids.length > 0 ? ids : [this.current!.id];
    })();
  }

  private lessonExposureId: string | null = null;

  private lessonHasMembers = false;

  private practiceSession: PracticeSession | null = null;

  private revisionPlan: RevisionPlan | null = null;

  private revisionInitialRevision = 0;

  private revisionWindowStartedAt = 0;

  private get revisionSession() {
    return this.machineState.revision;
  }
  private set revisionSession(value: SessionState['revision']) {
    this.machineState = { ...this.machineState, revision: value };
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
  private set events(value: SessionState['events']) {
    this.machineState = { ...this.machineState, events: value };
  }

  private progressBefore = 0;

  private lastAnswer: AnswerSnapshot | null = null;

  private submitting = false;

  private pendingReviewEventId: string | null = null;

  private reviewsByDeck: Map<string, number> = new Map();

  private reviewsDayStart = 0;

  private limitOverride: boolean = false;
  private setLimitOverride = (value: boolean | ((previous: boolean) => boolean)) => {
    this.limitOverride = typeof value === 'function' ? value(this.limitOverride) : value;
    this.publish();
  };

  private timeLimitOverride: boolean = false;
  private setTimeLimitOverride = (value: boolean | ((previous: boolean) => boolean)) => {
    this.timeLimitOverride = typeof value === 'function' ? value(this.timeLimitOverride) : value;
    this.publish();
  };

  private sessionStartMs = 0;

  private mounted = true;

  private readSessionState = () => this.machineState;

  private applySessionEvent = (event: SessionEventInput) => {
    const transition = transitionSession(this.machineState, event);
    this.machineState = transition.state;
    this.setSessionCardOutcomes(transition.state.outcomes);
    this.setSessionCardIds(transition.state.cardIds);
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
      recitations: this.simpleRecitations,
      introduction: this.machineState.introduction,
    });
  };

  private resetSimpleSessionOutcomes = () => {
    const outcomes = new Map<string, SessionCardOutcome>();
    this.sessionCardOutcomes = outcomes;
    this.setSessionCardOutcomes(outcomes);
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
    if (this.mounted) this.setCanUndo(false);
  };

  private presentCompletion = (nextSummary: SessionSummary, confirmed: boolean) => {
    this.setSummary(nextSummary);
    this.setPhase('finished');
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
    setProgress: this.setSchedulerProgress,
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
    this.serving = true;
    try {
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
            this.setCurrent(effect.card);
            if ((this.options.introduceNewCards ?? false) || this.introductionPresentation.stage)
              this.presentIntroduction(effect.card);
            this.setPhase('question');
            this.options.onCardServed?.();
            this.setHintStep(0);
            this.pendingReviewEventId = null;
            this.advanceTimer({ type: 'start', now: performance.now() });
            this.options.distraction.beginCard();
            this.options.distraction.setAnswerVisible(false);
            if (effect.invalidateProgress) this.progressCache.dirty = true;
            break;
        }
      }
    } finally {
      this.serving = false;
      this.publish();
    }
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
    this.setCanUndo(true);
    this.persistSimpleResume();
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
      this.machineState = { ...this.machineState, introduction: undefined };
      this.lastIntroduction = null;
      this.simpleMastered = new Set();
      this.simpleWrong = new Set();
      this.simpleQueue = this.createSimpleQueue(
        this.cards.filter((c) => !c.suspended && !(c.buriedUntil && c.buriedUntil > Date.now())),
      );
      this.events = [];
      this.progressBefore = 0;
      this.sessionStartMs = Date.now();
      this.setSummary(null);
      this.setSessionCardIds(this.simpleQueue.map((card) => card.id));
      this.resetSimpleSessionOutcomes();
      this.serveNext();
    } else {
      const ctx = this.ctx;
      if (!ctx) return;
      this.events = [];
      this.progressBefore = this.cachedSessionProgress(this.cards, ctx);
      this.setSummary(null);
      this.setLimitOverride(true);
      this.setTimeLimitOverride(true);
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
      this.setLessonNotesScreen(null);
      this.finish(true);
      return;
    }
    this.setLessonNotesScreen(null);
    this.serveNext();
  };

  private reveal = () => {
    this.setPhase((p) => {
      if (p !== 'question') return p;
      const card = this.current;
      if (card) {
        this.presentedAnswerInput = reviewAnswerInput(
          card,
          this.recitationSequence !== null,
          this.isTypingCard,
        );
      }
      this.advanceTimer({ type: 'reveal', now: performance.now() });
      return 'answer';
    });
    this.options.distraction.setAnswerVisible(true);
  };

  private revealRecitation = (lines: number) => {
    if (this.phase !== 'question') return;
    this.presentedAnswerInput = undefined;
    this.advanceTimer({ type: 'reveal', now: performance.now(), lines });
    this.setPhase('answer');
    this.options.distraction.setAnswerVisible(true);
  };

  private hide = () => {
    this.setPhase((p) => {
      if (p !== 'answer') return p;
      return 'question';
    });
    this.options.distraction.setAnswerVisible(false);
  };

  private undoLast = async (options?: { reveal?: boolean }) => {
    const recognition = this.lastIntroduction;
    if (!recognition) {
      const restored = await this.undoRecordedAnswer(options);
      if (restored && (this.options.introduceNewCards ?? false)) this.presentIntroduction(restored);
      return restored;
    }
    if (this.submitting) return;
    this.applySessionEvent({
      type: 'restore',
      snapshot: recognition.machine,
      card: recognition.card,
    });
    this.lastIntroduction = null;
    this.setCanUndo(false);
    this.setCurrent(recognition.card);
    this.presentIntroduction(recognition.card);
    this.setPhase('question');
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
          this.recitationSequence !== null,
          this.presentedAnswerInput === 'typed',
        ),
        markedBy,
        correct,
        manualGrade: typeof input === 'number' ? input : null,
        machineMarked,
        t: machineMarked ? (performance.now() - this.timerStart) / 1000 : this.responseTime,
        distracted: this.options.distraction.wasDistracted(),
      };
      const result = this.options.isSimpleMode
        ? await this.answerSimple(cardNow, response)
        : await this.answerScheduled(cardNow, response);
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
    this.setCanUndo(false);
    this.lastAnswer = null;
    this.lastIntroduction = null;
    this.updateLessonChoiceCard(updated);
    this.applySessionEvent({
      type: 'remove-card',
      card: updated,
      simple: this.options.isSimpleMode,
    });
    this.progressCache.dirty = true;
    this.setSchedulerProgress(sessionCompletionProgress(this.cards, ctx, this.sessionCardOutcomes));
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
    this.setEditing(true);
  };

  private resumeAfterEdit = () => {
    if (this.phase === 'question') {
      this.advanceTimer({ type: 'resume', now: performance.now() });
    }
  };

  private cancelEdit = () => {
    this.setEditing(false);
    this.resumeAfterEdit();
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
    this.serving = true;
    try {
      const recognition = this.lastIntroduction;
      const restoreIntroduction =
        this.options.introduceNewCards &&
        this.introductionPresentation.stage === 'familiarise' &&
        recognition?.card.id === updated.id &&
        this.introductionCursor.checked;
      if (restoreIntroduction) {
        this.applySessionEvent({ type: 'restore', snapshot: recognition.machine, card: updated });
        this.lastIntroduction = null;
        this.setCanUndo(false);
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
      this.setCurrent(updated);
      if (this.options.introduceNewCards) {
        this.updateLessonChoiceCard(updated);
        if (this.introductionPresentation.stage === 'familiarise') {
          if (restoreIntroduction) this.persistSimpleResume();
          this.presentIntroduction(updated);
          this.setPhase('question');
        }
      }
      this.setEditing(false);
      this.resumeAfterEdit();
    } finally {
      this.serving = false;
      this.publish();
    }
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
      if (this.current?.id === card.id) this.setCurrent(updated);
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

  private answerSimple = async (
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
    const deck = this.answerUnit(cardNow);
    if (!deck) return { undoAvailable: false };
    const perf = this.perf.get(deck.id);
    const hintUsed = this.hintStep > 0;
    // The controls stay binary, while the invisible grade uses the same
    // timing, calibration and hint rules as Practice. Machine-marked cards
    // retain their mark-aware grade.
    const machineSnapshot = snapshotSession(this.readSessionState());
    const eventId = this.pendingReviewEventId ?? makeId();
    this.pendingReviewEventId = eventId;
    const effect = this.applySessionEvent({
      type: 'answer',
      simple: true,
      review: {
        card: cardNow,
        eventId,
        sessionId: this.reviewSessionId,
        sessionKind: this.options.reviewSessionKind,
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
    const { grade } = effect.review;
    const { result, nextPerf, perfBefore, exposureAdded } = await persistSimpleSessionAnswer(
      deck.id,
      perf,
      () => effect.review,
      () => this.lessonExposureId,
    );
    if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
    if (nextPerf) this.perf.set(deck.id, nextPerf);
    this.lastAnswer =
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
            deckId: deck.id,
            deckReviews: this.reviewsByDeck.get(deck.id) ?? 0,
            simple: { exposureAdded },
          }
        : null;
    this.setCanUndo(result.recorded && retainUndo);
    const effects = this.applySessionEvent({
      type: 'simple-recorded',
      card: result.card,
      event: { cardId: cardNow.id, grade, correct, responseTimeSec: t, distracted },
    });
    this.pendingReviewEventId = null;
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist-resume':
          this.persistSimpleResume();
          break;
        case 'finish':
          this.finish(...effect.stop);
          break;
        case 'serve-next':
          this.serveNext();
          break;
      }
    }
    return { undoAvailable: this.lastAnswer !== null };
  };

  private recitationMasteredItemIds = (sequenceId: string) =>
    new Set(
      this.simpleQueue.flatMap((card) =>
        card.sequenceItemId &&
        this.simpleMastered.has(card.id) &&
        this.linesModeMap.get(card.id)?.id === sequenceId
          ? [card.sequenceItemId]
          : [],
      ),
    );

  private saveRecitationStep = (sequenceId: string, state: unknown) => {
    if (!this.options.isSimpleMode) return;
    if (state === null) {
      this.simpleRecitations.delete(sequenceId);
      return;
    }
    this.simpleRecitations.set(sequenceId, state);
    this.persistSimpleResume();
  };

  private answerRecitation = async (
    results: readonly {
      itemId: string;
      correct: boolean;
    }[],
    responseTimeSec: number,
    masteredItemIds: readonly string[] | 'all',
  ) => {
    const generation = this.generation;
    if (!this.recitationSequence || !this.options.isSimpleMode) return;
    const cards = new Map<string, Card>();
    for (const card of this.simpleQueue) {
      if (
        card.sequenceItemId &&
        !isLabelCardId(card.sequenceItemId) &&
        this.linesModeMap.get(card.id)?.id === this.recitationSequence!.id
      ) {
        cards.set(card.sequenceItemId, card);
      }
    }
    let outcomes = new Map(this.sessionCardOutcomes);
    const updateProgress = (event: SessionEventInput) => {
      const next = transitionSession({ ...this.readSessionState(), outcomes }, event).state;
      outcomes = next.outcomes;
      this.simpleMastered = next.simple.mastered;
      this.simpleWrong = next.simple.wrong;
    };
    for (const { itemId, correct } of results) {
      const card = cards.get(itemId);
      const deck = card && this.answerUnit(card);
      if (!card || !deck) continue;
      // The bar follows each manual check, including retries; scheduling still
      // records only the first recall and mastery waits for a completed chunk.
      updateProgress({ type: 'recitation-check', cardId: card.id, correct });
      if (this.events.some((event) => event.cardId === card.id)) continue;
      const recorded = await persistRecitationReview({
        card,
        sessionId: this.reviewSessionId,
        sessionKind: this.options.reviewSessionKind,
        deck,
        kind: this.reviewKind,
        responseTimeSec,
        correct,
      });
      if (!this.mounted || generation !== this.generation) return;
      this.applySessionEvent({
        type: 'recitation-recorded',
        card: recorded.card,
        event: recorded.event,
      });
      cards.set(recorded.card.sequenceItemId!, recorded.card);
    }
    if (masteredItemIds === 'all') this.simpleRecitations.delete(this.recitationSequence!.id);
    for (const itemId of masteredItemIds === 'all' ? [...cards.keys()] : masteredItemIds) {
      const card = cards.get(itemId);
      if (!card || this.simpleMastered.has(card.id)) continue;
      if (this.lessonExposureId) {
        await upsertLessonCardExposure(this.lessonExposureId, card.id);
        if (!this.mounted || generation !== this.generation) return;
      }
      // Mastery acknowledges the exposure write: a failed write must remain retryable.
      updateProgress({ type: 'recitation-mastered', cardIds: [card.id] });
    }
    this.sessionCardOutcomes = outcomes;
    this.setSessionCardOutcomes(outcomes);
    this.persistSimpleResume(outcomes);
    if ([...cards.values()].every((card) => this.simpleMastered.has(card.id))) this.serveNext();
  };

  private answerScheduled = async (
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
    const ctx = this.ctx;
    const deck = this.answerUnit(cardNow);
    const schedulingConfig = this.isGlobal ? deck : this.schedulingConfig;
    if (!ctx || !deck || !schedulingConfig) {
      this.submitting = false;
      return { undoAvailable: false };
    }
    const perf = this.perf.get(deck.id);
    const hintUsed = this.hintStep > 0;
    const machineSnapshot = snapshotSession(this.readSessionState());
    const perfBefore = perf ?? null;
    const eventId = this.pendingReviewEventId ?? makeId();
    this.pendingReviewEventId = eventId;
    const effect = this.applySessionEvent({
      type: 'answer',
      simple: false,
      review: {
        card: cardNow,
        eventId,
        sessionId: this.reviewSessionId,
        sessionKind: this.options.reviewSessionKind,
        revisionPlanId: this.revisionPlan?.id,
        revisionWindowId: this.revisionPlan ? this.options.requestWindowId : undefined,
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
    const { grade } = effect.review;
    const { result, performance: nextPerf } = await persistAnswer(effect.review, deck.id, perf);
    if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
    if (nextPerf) this.perf.set(deck.id, nextPerf);
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
    const revisionWindowForAnswer = this.revisionPlan?.windows.find(
      (candidate) => candidate.id === this.options.requestWindowId,
    );
    this.applySessionEvent({
      type: 'scheduled-recorded',
      card: updated,
      event: { cardId: cardNow.id, grade, correct, responseTimeSec: t, distracted },
      eventId,
      recorded,
      deckId: deck.id,
      global: this.isGlobal,
      now: Date.now(),
      hasRevisionPlan: this.revisionPlan !== null,
      revisionWindowEndsAt:
        this.revisionPlan && this.options.requestWindowId
          ? revisionWindowForAnswer
            ? this.revisionWindowStartedAt + revisionWindowForAnswer.budgetMinutes * 60000
            : Date.now()
          : undefined,
    });
    const nextCards = this.cards;
    this.setSchedulerProgress(sessionCompletionProgress(nextCards, ctx, this.sessionCardOutcomes));
    const reviewNow = Date.now();
    const reviewDayStart = startOfDay(reviewNow);
    if (reviewDayStart !== this.reviewsDayStart) {
      this.reviewsByDeck = await dailyReviewCounts(kind, reviewNow);
      if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
      this.reviewsDayStart = reviewDayStart;
    } else if (recorded) {
      this.reviewsByDeck.set(deck.id, (this.reviewsByDeck.get(deck.id) ?? 0) + 1);
    }
    const deckReviews = this.reviewsByDeck.get(deck.id) ?? 0;
    this.lastAnswer = recorded
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
          deckId: deck.id,
          deckReviews,
        }
      : null;
    this.setCanUndo(recorded);
    // Course and lesson sessions hold a single unit; global sessions key
    // the context by scheduling-unit id (see makeSessionContext).
    const sessionDeck = this.isGlobal ? ctx.decks.get(deck.id) : ctx.decks.values().next().value;
    const answerResult = answerFeedback({
      recorded,
      grade,
      card: updated,
      deck: sessionDeck?.deck ?? deck,
      examDateContext: sessionDeck?.oc.examDateContext,
    });
    this.progressCache.dirty = true;
    const revisionWindow = this.revisionPlan?.windows.find(
      (candidate) => candidate.id === this.options.requestWindowId,
    );
    const effects = afterScheduledAnswer(this.readSessionState(), {
      revision: this.revisionPlan !== null,
      context: ctx,
      practice: this.practiceSession !== null,
      deckReviews,
      maxReviewsPerDay: schedulingConfig.maxReviewsPerDay,
      dailyReviewGoal: schedulingConfig.dailyReviewGoal,
      sessionTimeLimitMinutes: schedulingConfig.sessionTimeLimitMinutes,
      limitOverride: this.limitOverride,
      timeLimitOverride: this.timeLimitOverride,
      revisionWindowEndsAt: revisionWindow
        ? this.revisionWindowStartedAt + revisionWindow.budgetMinutes * 60000
        : undefined,
      sessionStartMs: this.sessionStartMs,
      now: Date.now(),
    });
    for (const effect of effects) {
      if (effect.type === 'finish') this.finish(...effect.stop);
      else if (effect.type === 'serve-next') this.serveNext();
      else if (effect.type === 'persist-practice' && !this.completion.pending)
        await this.persistPracticeMilestone(nextCards, false);
      if (!this.mounted || generation !== this.generation) return { undoAvailable: false };
    }
    return this.lastAnswer ? answerResult : { undoAvailable: false };
  };

  private undoRecordedAnswer = async (options?: { reveal?: boolean }) => {
    const generation = this.generation;
    const snap = this.lastAnswer;
    const ctx = this.ctx;
    if (!this.mounted || !snap || !ctx || this.submitting || this.completion.persisting) return;
    this.submitting = true;
    try {
      await undoSessionAnswer(snap.undo, snap.simple?.exposureAdded);
      if (!this.mounted || generation !== this.generation) return;
      if (!this.mounted) return;
      this.applySessionEvent({
        type: 'restore',
        snapshot: snap.machine,
        card: snap.undo.cardBefore,
      });
      this.setSchedulerProgress(
        sessionCompletionProgress(this.cards, ctx, this.sessionCardOutcomes),
      );
      this.perf.set(snap.deckId, snap.undo.perfBefore ?? emptyPerformance(snap.deckId));
      if (snap.simple) this.persistSimpleResume();
      // Simple passes do not increment the scheduled daily review counter.
      const prevReviews = snap.deckReviews - (snap.simple ? 0 : 1);
      if (prevReviews > 0) this.reviewsByDeck.set(snap.deckId, prevReviews);
      else this.reviewsByDeck.delete(snap.deckId);
      this.completion.reset();
      this.setSummary(null);
      this.lastAnswer = null;
      this.setCanUndo(false);
      this.progressCache.dirty = true;
      this.setCurrent(snap.undo.cardBefore);
      this.setPhase(options?.reveal ? 'answer' : 'question');
      this.options.onCardServed?.();
      this.setHintStep(0);
      this.pendingReviewEventId = null;
      this.timerStart = performance.now();
      this.options.distraction.beginCard();
      this.responseTime = snap.responseTimeSec;
      this.presentedAnswerInput = snap.input;
      this.options.distraction.setAnswerVisible(options?.reveal === true);
      this.publish();
      return snap.undo.cardBefore;
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
    recitationSequence: this.recitationSequence,
    recitationMasteredItemIds: this.recitationMasteredItemIds,
    savedRecitationStep: (sequenceId: string) => this.simpleRecitations.get(sequenceId),
    saveRecitationStep: this.saveRecitationStep,
    currentCardIds: this.currentCardIds,
    setRecitationFocus: this.setRecitationFocus,
    answerRecitation: this.answerRecitation,
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
