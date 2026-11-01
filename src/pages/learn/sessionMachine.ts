import type { RecordReviewArgs } from '../../db/reviewRepository';
import type { Card } from '../../db/types';
import type { SessionCardOutcome, SessionEvent, SessionSummary } from '../../course/sessionSummary';
import { transitionSimpleAnswer, type SimpleSessionState } from '../../course/simpleSession';
import {
  snapshotRevisionSessionState,
  transitionRevisionAnswer,
  type RevisionSessionState,
} from '../../course/revisionSession';
import { applyCooldown, decrementCooldowns, type CooldownMap } from '../../fsrs/cooldown';
import { selectNext, sessionComplete, type SessionContext } from '../../fsrs/session';
import { allocateCramReview } from '../../fsrs/cramAllocator';
import { CRAM_SUCCESS_GRADES, createHalfLifeLogisticModel } from '../../fsrs/halfLifeLogisticModel';
import type { RevisionPlan, UserPerformance } from '../../db/types';
import { answerGrade, sessionStopAfterAnswer, type SessionStop } from './answerPolicy';

export interface SessionState {
  cards: Card[];
  simple: SimpleSessionState;
  cardIds: string[];
  events: SessionEvent[];
  outcomes: Map<string, SessionCardOutcome>;
  cooldowns: CooldownMap;
  revision: RevisionSessionState;
}

export interface ReviewEffect {
  type: 'persist-review';
  review: RecordReviewArgs;
  simple: boolean;
}

export type SessionEffect =
  | ReviewEffect
  | { type: 'persist-resume' }
  | { type: 'serve-next' }
  | { type: 'finish'; stop: SessionStop; blockComplete?: boolean }
  | { type: 'present-card'; card: Card; invalidateProgress: boolean }
  | { type: 'persist-practice' };

export interface SessionTransition {
  state: SessionState;
  effects: SessionEffect[];
}

export interface Selection {
  simple: boolean;
  context: SessionContext | null;
  now: number;
  reviewLimit?: number;
  revisionPlan: RevisionPlan | null;
  windowId?: string;
  windowStartedAt: number;
  performance: Map<string, UserPerformance>;
}

export type SessionEventInput =
  | {
      type: 'answer';
      review: Omit<RecordReviewArgs, 'grade'>;
      grading: Parameters<typeof answerGrade>[0];
      simple: boolean;
    }
  | { type: 'next'; selection: Selection }
  | { type: 'simple-recorded'; card: Card; event: SessionEvent }
  | {
      type: 'scheduled-recorded';
      card: Card;
      event: SessionEvent;
      eventId: string;
      recorded: boolean;
      deckId: string;
      global: boolean;
      now: number;
      revisionWindowEndsAt?: number;
      hasRevisionPlan: boolean;
    }
  | { type: 'recitation-check'; cardId: string; correct: boolean }
  | { type: 'recitation-recorded'; card: Card; event: SessionEvent }
  | { type: 'recitation-mastered'; cardIds: string[] }
  | { type: 'restore'; snapshot: SessionState; card: Card }
  | { type: 'replace-card'; card: Card }
  | { type: 'remove-card'; card: Card; simple: boolean };

const replace = (cards: Card[], card: Card) =>
  cards.map((candidate) => (candidate.id === card.id ? card : candidate));

/** Snapshot collections, not cards: persisted card records are replaced rather than mutated. */
export function snapshotSession(state: SessionState): SessionState {
  return {
    ...state,
    cards: [...state.cards],
    cardIds: [...state.cardIds],
    events: [...state.events],
    outcomes: new Map(state.outcomes),
    cooldowns: new Map(state.cooldowns),
    revision: snapshotRevisionSessionState(state.revision),
    simple: {
      queue: [...state.simple.queue],
      mastered: new Set(state.simple.mastered),
      wrong: new Set(state.simple.wrong),
      outcomes: new Map(state.simple.outcomes),
    },
  };
}

/** Requests describe writes; only acknowledgements advance the session. */
export function transitionSession(
  state: SessionState,
  event: SessionEventInput,
): SessionTransition {
  switch (event.type) {
    case 'answer':
      return {
        state,
        effects: [
          {
            type: 'persist-review',
            review: { ...event.review, grade: answerGrade(event.grading) },
            simple: event.simple,
          },
        ],
      };
    case 'restore':
      return {
        state: { ...snapshotSession(event.snapshot), cards: replace(state.cards, event.card) },
        effects: [],
      };
    case 'replace-card':
      return {
        state: {
          ...state,
          cards: replace(state.cards, event.card),
          simple: { ...state.simple, queue: replace(state.simple.queue, event.card) },
        },
        effects: [],
      };
    case 'remove-card': {
      const outcomes = new Map(state.outcomes);
      outcomes.delete(event.card.id);
      return {
        state: {
          ...state,
          cards: replace(state.cards, event.card),
          simple: {
            ...state.simple,
            outcomes,
            queue: event.simple
              ? state.simple.queue.filter((card) => card.id !== event.card.id)
              : state.simple.queue,
          },
          outcomes,
          cardIds: state.cardIds.filter((id) => id !== event.card.id),
        },
        effects: [],
      };
    }
    case 'simple-recorded': {
      const simple = transitionSimpleAnswer(
        {
          ...state.simple,
          outcomes: state.outcomes,
          queue: replace(state.simple.queue, event.card),
        },
        event.card,
        event.event.correct,
      );
      const remaining = simple.queue.some((card) => !simple.mastered.has(card.id));
      return {
        state: {
          ...state,
          simple,
          cards: replace(state.cards, event.card),
          outcomes: simple.outcomes,
          events: [...state.events, event.event],
          cardIds: event.card.suspended
            ? state.cardIds.filter((id) => id !== event.card.id)
            : state.cardIds,
        },
        effects: [
          { type: 'persist-resume' },
          remaining ? { type: 'serve-next' } : { type: 'finish', stop: [!event.card.suspended] },
        ],
      };
    }
    case 'scheduled-recorded': {
      const cards = replace(state.cards, event.card);
      const outcomes = new Map(state.outcomes).set(
        event.card.id,
        event.event.correct ? 'correct' : 'wrong',
      );
      const cooldowns = new Map(state.cooldowns);
      let revision = state.revision;
      if (event.revisionWindowEndsAt !== undefined) {
        revision = transitionRevisionAnswer(
          {
            ...revision,
            reviewEventIds: event.recorded
              ? [...revision.reviewEventIds, event.eventId]
              : revision.reviewEventIds,
          },
          {
            cardId: event.card.id,
            correct: event.event.correct,
            now: event.now,
            productiveAt: event.card.due ?? event.now,
            windowEndsAt: event.revisionWindowEndsAt,
          },
        );
      } else if (event.event.grade === 1) {
        applyCooldown(
          cooldowns,
          event.card.id,
          event.global
            ? cards.filter((card) => card.schedulingUnitId === event.deckId).length
            : cards.length,
        );
      }
      if (!event.hasRevisionPlan) decrementCooldowns(cooldowns, event.card.id);
      return {
        state: {
          ...state,
          cards,
          outcomes,
          cooldowns,
          revision,
          events: [...state.events, event.event],
        },
        effects: [],
      };
    }
    case 'recitation-check': {
      const outcomes = new Map(state.outcomes).set(
        event.cardId,
        event.correct ? 'correct' : 'wrong',
      );
      const wrong = new Set(state.simple.wrong);
      if (event.correct) wrong.delete(event.cardId);
      else wrong.add(event.cardId);
      return {
        state: { ...state, outcomes, simple: { ...state.simple, outcomes, wrong } },
        effects: [],
      };
    }
    case 'recitation-recorded':
      return {
        state: {
          ...state,
          cards: replace(state.cards, event.card),
          simple: { ...state.simple, queue: replace(state.simple.queue, event.card) },
          events: [...state.events, event.event],
        },
        effects: [],
      };
    case 'recitation-mastered': {
      const mastered = new Set(state.simple.mastered);
      const wrong = new Set(state.simple.wrong);
      const outcomes = new Map(state.outcomes);
      for (const id of event.cardIds) {
        mastered.add(id);
        wrong.delete(id);
        outcomes.set(id, 'correct');
      }
      return {
        state: { ...state, outcomes, simple: { ...state.simple, outcomes, mastered, wrong } },
        effects: [{ type: 'persist-resume' }],
      };
    }
    case 'next':
      return selectSessionCard(state, event.selection);
  }
}

function selectSessionCard(state: SessionState, input: Selection): SessionTransition {
  const { context, now, revisionPlan, windowId } = input;
  const finish = (
    completed: boolean,
    timedOut = false,
    blockComplete = false,
  ): SessionTransition => ({
    state,
    effects: [{ type: 'finish', stop: [completed, false, timedOut], blockComplete }],
  });
  if (
    !input.simple &&
    input.reviewLimit !== undefined &&
    input.reviewLimit > 0 &&
    state.events.length >= input.reviewLimit
  )
    return finish(context ? sessionComplete(state.cards, context, now) : false, false, true);
  if (input.simple) {
    const card = state.simple.queue.find((candidate) => !state.simple.mastered.has(candidate.id));
    return {
      state,
      effects: [
        { type: 'persist-resume' },
        card
          ? { type: 'present-card', card, invalidateProgress: false }
          : { type: 'finish', stop: [true] },
      ],
    };
  }
  if (!context) return { state, effects: [] };
  if (revisionPlan && windowId) {
    const window = revisionPlan.windows.find((candidate) => candidate.id === windowId);
    const remainingWindowSeconds = window
      ? window.budgetMinutes * 60 - (now - input.windowStartedAt) / 1000
      : 0;
    const park = () => ({
      ...state,
      revision: {
        ...state.revision,
        parked: new Set([...state.revision.parked, ...state.revision.retryAt.keys()]),
      },
    });
    if (!window || remainingWindowSeconds <= 0 || now >= revisionPlan.input.deadlineAt)
      return { ...finish(false, true), state: park() };
    const eligibleCardIds = new Set(
      revisionPlan.scope.eligibleCardIds.filter(
        (id) =>
          !state.revision.completed.has(id) &&
          !state.revision.parked.has(id) &&
          (state.revision.retryAt.get(id) ?? 0) <= now,
      ),
    );
    const objectiveContext = context.decks.values().next().value?.oc;
    if (!objectiveContext) return { state, effects: [] };
    const allocation = allocateCramReview({
      cards: state.cards,
      eligibleCardIds,
      context: objectiveContext,
      assessmentAt: revisionPlan.input.deadlineAt,
      now,
      remainingWindowSeconds,
      currentWindowId: windowId,
      futureWindowStarts: [],
      projection: revisionPlan.input.projection,
      model: createHalfLifeLogisticModel(objectiveContext.ctx.decay),
      successGrades: CRAM_SUCCESS_GRADES,
      performanceByDeck: input.performance,
    });
    const card =
      allocation.mode === 'practice-fallback'
        ? allocation.cards[0]
        : (allocation.selected?.card ??
          (allocation.stopReason ? undefined : allocation.fallbackCards[0]));
    return card
      ? { state, effects: [{ type: 'present-card', card, invalidateProgress: true }] }
      : { ...finish(true), state: park() };
  }
  if (sessionComplete(state.cards, context, now)) return finish(true);
  const card = selectNext(state.cards, context, state.cooldowns, now);
  return card
    ? { state, effects: [{ type: 'present-card', card, invalidateProgress: true }] }
    : finish(true);
}

export function afterScheduledAnswer(
  state: SessionState,
  input: Parameters<typeof sessionStopAfterAnswer>[0] & {
    revision: boolean;
    context: SessionContext;
    practice: boolean;
  },
): SessionEffect[] {
  const stop = sessionStopAfterAnswer(input);
  if (stop) return [{ type: 'finish', stop }];
  if (!input.revision && sessionComplete(state.cards, input.context, input.now))
    return [{ type: 'finish', stop: [true] }];
  return [
    { type: 'serve-next' },
    ...(!input.revision && input.practice ? [{ type: 'persist-practice' } as const] : []),
  ];
}

export interface ResponseTimer {
  startedAt: number;
  responseSeconds: number;
  pausedElapsed: number;
}
export function transitionResponseTimer(
  state: ResponseTimer,
  event: { type: 'start' | 'pause' | 'resume' | 'reveal'; now: number; lines?: number },
): ResponseTimer {
  switch (event.type) {
    case 'start':
      return { ...state, startedAt: event.now };
    case 'pause':
      return { ...state, pausedElapsed: event.now - state.startedAt };
    case 'resume':
      return { ...state, startedAt: event.now - state.pausedElapsed };
    case 'reveal':
      return {
        ...state,
        responseSeconds: (event.now - state.startedAt) / 1000 / Math.max(1, event.lines ?? 1),
      };
  }
}

export interface CompletionState {
  finalising: boolean;
  confirmed: boolean;
  pending: SessionSummary | null;
}
export type CompletionEvent =
  | { type: 'propose'; summary: NonNullable<CompletionState['pending']>; retainUndo: boolean }
  | { type: 'confirmed' }
  | { type: 'failed'; retainUndo: boolean }
  | { type: 'reset' };
export function transitionCompletion(
  state: CompletionState,
  event: CompletionEvent,
): { state: CompletionState; effects: ('show-summary' | 'persist-completion' | 'clear-undo')[] } {
  switch (event.type) {
    case 'propose':
      if (state.finalising) return { state, effects: [] };
      return {
        state: { finalising: true, confirmed: false, pending: event.summary },
        effects: event.retainUndo ? ['show-summary'] : ['clear-undo', 'persist-completion'],
      };
    case 'confirmed':
      return {
        state: { finalising: state.finalising, confirmed: true, pending: null },
        effects: ['clear-undo', 'show-summary'],
      };
    case 'failed':
      return {
        state: { ...state, finalising: event.retainUndo ? state.finalising : false },
        effects: [],
      };
    case 'reset':
      return { state: { finalising: false, confirmed: false, pending: null }, effects: [] };
  }
}
