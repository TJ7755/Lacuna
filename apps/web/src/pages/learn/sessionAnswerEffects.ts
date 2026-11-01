import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { SessionCardOutcome, SessionEvent, SessionSummary } from '../../course/sessionSummary';
import { upsertLessonCardExposure } from '../../db/lessonRepository';
import { dailyReviewCounts } from '../../db/reviewHistoryRead';
import { makeId } from '../../db/schema';
import { isLabelCardId } from '../../db/sequenceGeneration';
import type {
  Card,
  Grade,
  ReviewSessionKind,
  RevisionPlan,
  SchedulerConfig,
  Sequence,
  UserPerformance,
} from '../../db/types';
import { emptyPerformance } from '../../fsrs/grading';
import type { SessionContext } from '../../fsrs/session';
import { sessionCompletionProgress } from '../../fsrs/session';
import type { JevMarkProvenance } from '../../jev/types';
import { startOfDay } from '../../utils/datetime';
import { answerFeedback, persistAnswer, type AnswerResult } from './answerSteps';
import {
  persistRecitationReview,
  persistSimpleSessionAnswer,
  undoSessionAnswer,
  type AnswerSnapshot,
} from './sessionAnswerPersistence';
import { type PracticeSession } from './sessionCompletionPersistence';
import {
  afterScheduledAnswer,
  snapshotSession,
  transitionSession,
  type CompletionEvent,
  type SessionEventInput,
  type SessionState,
} from './sessionMachine';
import type { MachineMarkedAnswer, Phase, StudyUnit } from './types';

import type { SessionEffect } from './sessionMachine';
import type { Cell } from './sessionRuntime';
import type { UseLearnSessionParams } from './useLearnSession';
/** One submitted answer, as the grading paths need it. */
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
}

type SessionSchedulingConfig = SchedulerConfig & {
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
};
interface SessionAnswerEnvironment {
  isGlobal: boolean;
  schedulingUnitsRef: Cell<Map<string, StudyUnit>>;
  perfRef: Cell<Map<string, UserPerformance>>;
  hintStepRef: Cell<0 | 2 | 1>;
  readSessionStateRef: Cell<() => SessionState>;
  pendingReviewEventId: Cell<string | null>;
  reviewSessionIdRef: Cell<string>;
  reviewSessionKind: ReviewSessionKind;
  reviewKindRef: Cell<'scheduling-unit' | 'course'>;
  lessonExposureIdRef: Cell<string | null>;
  lastAnswer: Cell<AnswerSnapshot | null>;
  reviewsByDeck: Cell<Map<string, number>>;
  setCanUndo: (value: boolean) => void;
  applySessionEventRef: Cell<(event: SessionEventInput) => SessionEffect[]>;
  persistSimpleResume: (outcomes?: Map<string, SessionCardOutcome>) => void;
  finish: (
    reachedGoal: boolean,
    limitReached?: boolean,
    timeLimitReached?: boolean,
    dailyGoalReached?: boolean,
    blockComplete?: boolean,
  ) => void;
  serveNext: () => void;
  simpleQueue: Cell<Card[]>;
  simpleMastered: Cell<Set<string>>;
  simpleWrong: Cell<Set<string>>;
  setSessionCardOutcomes: (outcomes: Map<string, SessionCardOutcome>) => void;
  linesModeMapRef: Cell<Map<string, Sequence>>;
  isSimpleMode: boolean;
  simpleRecitations: Cell<Map<string, unknown>>;
  recitationSequence: Sequence | null;
  events: Cell<SessionEvent[]>;
  ctxRef: Cell<SessionContext | null>;
  schedulingConfigRef: Cell<SessionSchedulingConfig | null>;
  submitting: Cell<boolean>;
  revisionPlanRef: Cell<RevisionPlan | null>;
  requestWindowId: string | undefined;
  revisionWindowStartedAt: Cell<number>;
  cardsRef: Cell<Card[]>;
  setSchedulerProgress: (value: number) => void;
  sessionCardOutcomesRef: Cell<Map<string, SessionCardOutcome>>;
  reviewsDayStart: Cell<number>;
  progressCacheRef: Cell<{ dirty: boolean; value: number }>;
  practiceSessionRef: Cell<PracticeSession | null>;
  sessionStartMs: Cell<number>;
  pendingCompletion: Cell<SessionSummary | null>;
  persistPracticeMilestone: (cards: Card[], completed: boolean) => Promise<void>;
  limitOverride: boolean;
  timeLimitOverride: boolean;
  completionPromise: Cell<Promise<boolean> | null>;
  mountedRef: Cell<boolean>;
  applyCompletionEvent: (
    event: CompletionEvent,
  ) => ('show-summary' | 'persist-completion' | 'clear-undo')[];
  setSummary: (value: SessionSummary | null) => void;
  setCurrent: (value: Card | null) => void;
  setPhase: (value: Phase) => void;
  onCardServedRef: Cell<(() => void) | undefined>;
  setHintStep: (value: 0 | 1 | 2) => void;
  timerStart: Cell<number>;
  distraction: DistractionTracker;
  responseTime: Cell<number>;
  presentedAnswerInput: Cell<'typed' | 'reveal' | undefined>;
  notify: UseLearnSessionParams['notify'];
}

/** Executes acknowledged review writes and translates their results into machine events. */
export function createSessionAnswerEffects({
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
}: SessionAnswerEnvironment) {
  const answerUnit = (card: Card): StudyUnit | undefined =>
    isGlobal
      ? card.schedulingUnitId
        ? schedulingUnitsRef.current.get(card.schedulingUnitId)
        : undefined
      : schedulingUnitsRef.current.values().next().value;
  const answerSimple = async (
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

    const machineSnapshot = snapshotSession(readSessionStateRef.current());
    const eventId = pendingReviewEventId.current ?? makeId();
    pendingReviewEventId.current = eventId;
    const effect = applySessionEventRef
      .current({
        type: 'answer',
        simple: true,
        review: {
          card: cardNow,
          eventId,
          sessionId: reviewSessionIdRef.current,
          sessionKind: reviewSessionKind,
          deck,
          kind: reviewKindRef.current,
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
          manualGrade: null,
          correct,
          responseTimeSec: t,
          hintUsed,
          performance: perf,
        },
      })
      .find((effect) => effect.type === 'persist-review')!;
    const { grade } = effect.review;
    const { result, nextPerf, perfBefore, exposureAdded } = await persistSimpleSessionAnswer(
      deck.id,
      perf,
      () => effect.review,
      () => lessonExposureIdRef.current,
    );
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
            deckId: deck.id,
            deckReviews: reviewsByDeck.current.get(deck.id) ?? 0,
            simple: { exposureAdded },
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
  };
  const recitationMasteredItemIds = (sequenceId: string) =>
    new Set(
      simpleQueue.current.flatMap((card) =>
        card.sequenceItemId &&
        simpleMastered.current.has(card.id) &&
        linesModeMapRef.current.get(card.id)?.id === sequenceId
          ? [card.sequenceItemId]
          : [],
      ),
    );
  const saveRecitationStep = (sequenceId: string, state: unknown) => {
    if (!isSimpleMode) return;
    if (state === null) {
      simpleRecitations.current.delete(sequenceId);
      return;
    }
    simpleRecitations.current.set(sequenceId, state);
    persistSimpleResume();
  };
  const answerRecitation = async (
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
    let outcomes = new Map(sessionCardOutcomesRef.current);
    const updateProgress = (event: SessionEventInput) => {
      const next = transitionSession({ ...readSessionStateRef.current(), outcomes }, event).state;
      outcomes = next.outcomes;
      simpleMastered.current = next.simple.mastered;
      simpleWrong.current = next.simple.wrong;
    };
    for (const { itemId, correct } of results) {
      const card = cards.get(itemId);
      const deck = card && answerUnit(card);
      if (!card || !deck) continue;
      // The bar follows each manual check, including retries; scheduling still
      // records only the first recall and mastery waits for a completed chunk.
      updateProgress({ type: 'recitation-check', cardId: card.id, correct });
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
      updateProgress({ type: 'recitation-mastered', cardIds: [card.id] });
      if (lessonExposureIdRef.current) {
        await upsertLessonCardExposure(lessonExposureIdRef.current, card.id);
      }
    }
    sessionCardOutcomesRef.current = outcomes;
    setSessionCardOutcomes(outcomes);
    persistSimpleResume(outcomes);
    if ([...cards.values()].every((card) => simpleMastered.current.has(card.id))) serveNext();
  };
  const answerScheduled = async (
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

    const machineSnapshot = snapshotSession(readSessionStateRef.current());
    const perfBefore = perf ?? null;
    const eventId = pendingReviewEventId.current ?? makeId();
    pendingReviewEventId.current = eventId;

    const effect = applySessionEventRef
      .current({
        type: 'answer',
        simple: false,
        review: {
          card: cardNow,
          eventId,
          sessionId: reviewSessionIdRef.current,
          sessionKind: reviewSessionKind,
          revisionPlanId: revisionPlanRef.current?.id,
          revisionWindowId: revisionPlanRef.current ? requestWindowId : undefined,
          deck,
          kind: reviewKindRef.current,
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
    const { grade } = effect.review;
    const { result, performance: nextPerf } = await persistAnswer(effect.review, deck.id, perf);
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
    setSchedulerProgress(sessionCompletionProgress(nextCards, ctx, sessionCardOutcomesRef.current));

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
          deckId: deck.id,
          deckReviews,
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
  };
  const undoLast = async (options?: { reveal?: boolean }) => {
    const snap = lastAnswer.current;
    const ctx = ctxRef.current;
    if (!snap || !ctx || submitting.current || completionPromise.current) return;
    submitting.current = true;
    try {
      await undoSessionAnswer(snap.undo, snap.simple?.exposureAdded);
      if (!mountedRef.current) return;
      applySessionEventRef.current({
        type: 'restore',
        snapshot: snap.machine,
        card: snap.undo.cardBefore,
      });
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
  };
  return {
    answerUnit,
    answerSimple,
    recitationMasteredItemIds,
    saveRecitationStep,
    answerRecitation,
    answerScheduled,
    undoLast,
  };
}
