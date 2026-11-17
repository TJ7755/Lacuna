import type {
  Card,
  Grade,
  RevisionPlan,
  SchedulerConfig,
  UserPerformance,
} from '@lacuna/core/db/types';
import type { JevMarkProvenance } from '@lacuna/core/jev/types';
import { dailyReviewCounts } from '../../db/reviewHistoryRead';
import { makeId } from '../../db/schema';
import { emptyPerformance } from '@lacuna/core/fsrs/grading';
import type { SessionContext } from '@lacuna/core/fsrs/session';
import { startOfDay } from '@lacuna/core/utils/datetime';
import { answerFeedback, type AnswerResult } from './answerSteps';
import {
  persistSessionAnswer,
  undoSessionAnswer,
  type AnswerSnapshot,
} from './sessionAnswerPersistence';
import type { SessionCompletion } from './sessionCompletion';
import type { SessionEffect, SessionEventInput } from './sessionMachine';
import type { MachineMarkedAnswer, StudyUnit } from './types';

/** One submitted answer, after presentation has resolved its input and timing. */
export interface AnswerResponse {
  retainUndo: boolean;
  input?: 'typed' | 'reveal';
  markedBy?: JevMarkProvenance;
  correct: boolean;
  manualGrade: Grade | null;
  machineMarked: MachineMarkedAnswer | null;
  /** Response time in seconds. */
  t: number;
  distracted: boolean;
  hintUsed: boolean;
}

interface AnswerContext {
  mounted: boolean;
  generation: number;
  simple: boolean;
  global: boolean;
  context: SessionContext | null;
  schedulingConfig:
    | (SchedulerConfig & {
        dailyReviewGoal?: number;
        sessionTimeLimitMinutes?: number;
      })
    | null;
  review: Pick<
    Parameters<typeof persistSessionAnswer>[0]['review'],
    'sessionId' | 'sessionKind' | 'kind'
  >;
  revisionPlan: RevisionPlan | null;
  windowId: string | undefined;
  windowStartedAt: number;
  exposureLessonId: string | null;
  practice: boolean;
  limits: {
    limitOverride: boolean;
    timeLimitOverride: boolean;
    sessionStartMs: number;
  };
  completion: Pick<SessionCompletion, 'pending' | 'persisting'>;
  cards: Card[];
}

interface AnswerEnvironment {
  read(): AnswerContext;
  unitForCard(card: Card): StudyUnit | undefined;
  transition(event: SessionEventInput): SessionEffect[];
  updateProgress(context: SessionContext): void;
  applyEffect(effect: SessionEffect, cards: Card[]): void | Promise<void>;
  restore(snapshot: AnswerSnapshot, reveal: boolean): void;
  reportError(error: unknown): void;
}

/** Owns review writes, retry identities, acknowledgement counters and reversible receipts. */
export class SessionAnswers {
  constructor(private environment: AnswerEnvironment) {}

  private performanceByDeck = new Map<string, UserPerformance>();
  private undoReceipt: AnswerSnapshot | null = null;
  private writePending = false;

  get performance() {
    return this.performanceByDeck;
  }

  get lastAnswer() {
    return this.undoReceipt;
  }

  get submitting() {
    return this.writePending;
  }
  private pendingReviewEventId: string | null = null;
  private reviewsByDeck = new Map<string, number>();
  private reviewsDayStart = 0;

  reset = () => {
    this.clearUndo();
    this.writePending = false;
    this.performanceByDeck = new Map();
    this.reviewsByDeck = new Map();
    this.reviewsDayStart = 0;
  };

  initialise = (
    performance: Map<string, UserPerformance>,
    reviewsDayStart: number,
    reviewsByDeck: Map<string, number>,
  ) => {
    this.performanceByDeck = performance;
    this.reviewsDayStart = reviewsDayStart;
    this.reviewsByDeck = reviewsByDeck;
  };

  clearUndo = () => {
    this.undoReceipt = null;
  };

  beginCard = () => {
    this.pendingReviewEventId = null;
  };

  private active = (generation: number) => {
    const current = this.environment.read();
    return current.mounted && generation === current.generation;
  };

  record = async (card: Card, response: AnswerResponse): Promise<AnswerResult> => {
    const { generation, mounted } = this.environment.read();
    if (!mounted || this.submitting) return { undoAvailable: false };
    this.writePending = true;
    try {
      return await this.persist(card, response);
    } finally {
      if (generation === this.environment.read().generation) this.writePending = false;
    }
  };

  private persist = async (
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
      hintUsed,
    }: AnswerResponse,
  ): Promise<AnswerResult> => {
    const initial = this.environment.read();
    const { generation, simple, context: ctx } = initial;
    const deck = this.environment.unitForCard(cardNow);
    const schedulingConfig = initial.global ? deck : initial.schedulingConfig;
    if (!deck || (!simple && (!ctx || !schedulingConfig))) return { undoAvailable: false };
    const perf = this.performance.get(deck.id);
    const eventId = this.pendingReviewEventId ?? makeId();
    this.pendingReviewEventId = eventId;
    const effect = this.environment
      .transition({
        type: 'answer',
        simple,
        retainUndo,
        review: {
          card: cardNow,
          eventId,
          ...initial.review,
          revisionPlanId: simple ? undefined : initial.revisionPlan?.id,
          revisionWindowId: !simple && initial.revisionPlan ? initial.windowId : undefined,
          deck,
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
      })
      .find((effect) => effect.type === 'persist-review')!;
    const { result, nextPerf, snapshot, event } = await persistSessionAnswer(
      effect,
      perf,
      () => this.environment.read().exposureLessonId,
    );
    if (!this.active(generation)) return { undoAvailable: false };
    if (nextPerf) this.performance.set(deck.id, nextPerf);
    const acknowledged = this.environment.read();
    const revisionWindow = acknowledged.revisionPlan?.windows.find(
      (candidate) => candidate.id === acknowledged.windowId,
    );
    if (!simple) {
      const reviewNow = Date.now();
      const reviewDayStart = startOfDay(reviewNow);
      if (reviewDayStart !== this.reviewsDayStart) {
        this.reviewsByDeck = await dailyReviewCounts(result.kind, reviewNow);
        if (!this.active(generation)) return { undoAvailable: false };
        this.reviewsDayStart = reviewDayStart;
      } else if (result.recorded) {
        this.reviewsByDeck.set(deck.id, (this.reviewsByDeck.get(deck.id) ?? 0) + 1);
      }
      const current = this.environment.read();
      this.environment.transition({
        type: 'scheduled-recorded',
        card: result.card,
        event,
        eventId,
        recorded: result.recorded,
        deckId: deck.id,
        global: current.global,
        now: Date.now(),
        hasRevisionPlan: current.revisionPlan !== null,
        revisionWindowEndsAt:
          current.revisionPlan && current.windowId
            ? revisionWindow
              ? current.windowStartedAt + revisionWindow.budgetMinutes * 60000
              : Date.now()
            : undefined,
      });
      this.environment.updateProgress(ctx!);
    }
    const current = this.environment.read();
    const deckReviews = this.reviewsByDeck.get(deck.id) ?? 0;
    const effects = this.environment.transition({
      type: 'answer-ready',
      snapshot: { ...snapshot, deckReviews },
      recorded: result.recorded,
      card: result.card,
      event,
      scheduled: simple
        ? null
        : {
            revision: current.revisionPlan !== null,
            context: ctx!,
            practice: current.practice,
            deckReviews,
            maxReviewsPerDay: schedulingConfig!.maxReviewsPerDay,
            dailyReviewGoal: schedulingConfig!.dailyReviewGoal,
            sessionTimeLimitMinutes: schedulingConfig!.sessionTimeLimitMinutes,
            ...current.limits,
            revisionWindowEndsAt: revisionWindow
              ? current.windowStartedAt + revisionWindow.budgetMinutes * 60000
              : undefined,
            now: Date.now(),
          },
    });
    if (simple) this.beginCard();
    // Course/lesson contexts hold one unit; global contexts key by scheduling-unit id.
    const sessionDeck = current.global ? ctx?.decks.get(deck.id) : ctx?.decks.values().next().value;
    const feedback = simple
      ? { undoAvailable: true }
      : answerFeedback({
          recorded: result.recorded,
          grade: event.grade,
          card: result.card,
          deck: sessionDeck?.deck ?? deck,
          examDateContext: sessionDeck?.oc.examDateContext,
        });
    await this.executeEffects(effects);
    if (!this.active(generation)) return { undoAvailable: false };
    return this.lastAnswer ? feedback : { undoAvailable: false };
  };

  private executeEffects = async (effects: SessionEffect[]) => {
    const { generation, cards } = this.environment.read();
    for (const effect of effects) {
      if (effect.type === 'retain-undo') this.undoReceipt = effect.snapshot;
      const pending = this.environment.applyEffect(effect, cards);
      if (pending) await pending;
      if (!this.active(generation)) return;
    }
  };

  undo = async (options?: { reveal?: boolean }) => {
    const initial = this.environment.read();
    const { generation, context: ctx } = initial;
    const snap = this.lastAnswer;
    if (!initial.mounted || !snap || !ctx || this.submitting || initial.completion.persisting)
      return;
    this.writePending = true;
    try {
      await undoSessionAnswer(snap.undo, snap.simple?.exposureAdded);
      if (!this.active(generation)) return;
      const effects = this.environment.transition({ type: 'undo-recorded', snapshot: snap });
      this.environment.updateProgress(ctx);
      this.performance.set(snap.deckId, snap.undo.perfBefore ?? emptyPerformance(snap.deckId));
      for (const effect of effects) {
        if (effect.type === 'persist-resume')
          void this.environment.applyEffect(effect, this.environment.read().cards);
        if (effect.type !== 'restore-answer') continue;
        const { snapshot: restored, deckReviews } = effect;
        if (deckReviews > 0) this.reviewsByDeck.set(restored.deckId, deckReviews);
        else this.reviewsByDeck.delete(restored.deckId);
        this.environment.restore(restored, options?.reveal === true);
        return restored.undo.cardBefore;
      }
    } catch (error) {
      this.environment.reportError(error);
    } finally {
      if (generation === this.environment.read().generation) this.writePending = false;
    }
  };
}
