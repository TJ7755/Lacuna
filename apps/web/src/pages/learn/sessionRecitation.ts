import type { Card, Sequence } from '@lacuna/core/db/types';
import { upsertLessonCardExposure } from '../../db/lessonRepository';
import { isLabelCardId } from '../../db/sequenceGeneration';
import { persistRecitationReview } from './sessionAnswerPersistence';
import { transitionSession, type SessionEventInput, type SessionState } from './sessionMachine';

type ReviewContext = Pick<
  Parameters<typeof persistRecitationReview>[0],
  'sessionId' | 'sessionKind' | 'kind'
>;

interface RecitationContext {
  state: SessionState;
  current: Card | null;
  enabled: boolean;
  sequences: ReadonlyMap<string, Sequence>;
  exposureLessonId: string | null;
  generation: number;
  mounted: boolean;
  review: ReviewContext;
}

interface RecitationEnvironment {
  read(): RecitationContext;
  unitForCard(card: Card): Parameters<typeof persistRecitationReview>[0]['deck'] | undefined;
  update(state: SessionState, publish: boolean): void;
  persistResume(): void;
  publish(): void;
  serveNext(): void;
}

/** Owns sequence membership, saved steps and acknowledgement of recitation evidence. */
export class SessionRecitation {
  constructor(private environment: RecitationEnvironment) {}

  steps = new Map<string, unknown>();
  private focus: string[] = [];

  get sequence() {
    const { current, sequences } = this.environment.read();
    return current?.sequenceItemId && !isLabelCardId(current.sequenceItemId)
      ? (sequences.get(current.id) ?? null)
      : null;
  }

  get currentCardIds() {
    const { current, state, enabled, sequences } = this.environment.read();
    if (!current) return [];
    const sequence = this.sequence;
    if (!sequence || !enabled) return [current.id];
    const ids = state.cards.flatMap((card) =>
      card.sequenceItemId &&
      this.focus.includes(card.sequenceItemId) &&
      sequences.get(card.id)?.id === sequence.id
        ? [card.id]
        : [],
    );
    return ids.length > 0 ? ids : [current.id];
  }

  setFocus = (value: string[] | ((previous: string[]) => string[])) => {
    this.focus = typeof value === 'function' ? value(this.focus) : value;
    this.environment.publish();
  };

  masteredItemIds = (sequenceId: string) => {
    const { state, sequences } = this.environment.read();
    return new Set(
      state.simple.queue.flatMap((card) =>
        card.sequenceItemId &&
        state.simple.mastered.has(card.id) &&
        sequences.get(card.id)?.id === sequenceId
          ? [card.sequenceItemId]
          : [],
      ),
    );
  };

  savedStep = (sequenceId: string) => this.steps.get(sequenceId);

  saveStep = (sequenceId: string, state: unknown) => {
    if (!this.environment.read().enabled) return;
    if (state === null) {
      this.steps.delete(sequenceId);
      return;
    }
    this.steps.set(sequenceId, state);
    this.environment.persistResume();
  };

  answer = async (
    results: readonly { itemId: string; correct: boolean }[],
    responseTimeSec: number,
    masteredItemIds: readonly string[] | 'all',
  ) => {
    const initial = this.environment.read();
    const sequence = this.sequence;
    if (!sequence || !initial.enabled) return;
    const active = () => {
      const current = this.environment.read();
      return current.mounted && current.generation === initial.generation;
    };
    const cards = new Map<string, Card>();
    for (const card of initial.state.simple.queue) {
      if (
        card.sequenceItemId &&
        !isLabelCardId(card.sequenceItemId) &&
        initial.sequences.get(card.id)?.id === sequence.id
      ) {
        cards.set(card.sequenceItemId, card);
      }
    }
    let outcomes = new Map(initial.state.outcomes);
    const updateProgress = (event: SessionEventInput) => {
      const state = this.environment.read().state;
      const next = transitionSession({ ...state, outcomes }, event).state;
      outcomes = next.outcomes;
      // Checks and acknowledged mastery survive a later failed write, but the
      // complete batch's outcomes are published and saved only at the end.
      this.environment.update(
        {
          ...state,
          simple: { ...state.simple, mastered: next.simple.mastered, wrong: next.simple.wrong },
        },
        false,
      );
    };
    for (const { itemId, correct } of results) {
      const card = cards.get(itemId);
      const deck = card && this.environment.unitForCard(card);
      if (!card || !deck) continue;
      // Manual retries update progress; only the first recall updates scheduling.
      updateProgress({ type: 'recitation-check', cardId: card.id, correct });
      if (this.environment.read().state.events.some((event) => event.cardId === card.id)) continue;
      const recorded = await persistRecitationReview({
        card,
        ...this.environment.read().review,
        deck,
        responseTimeSec,
        correct,
      });
      if (!active()) return;
      this.environment.update(
        transitionSession(this.environment.read().state, {
          type: 'recitation-recorded',
          card: recorded.card,
          event: recorded.event,
        }).state,
        true,
      );
      cards.set(recorded.card.sequenceItemId!, recorded.card);
    }
    if (masteredItemIds === 'all') this.steps.delete(this.sequence!.id);
    for (const itemId of masteredItemIds === 'all' ? [...cards.keys()] : masteredItemIds) {
      const card = cards.get(itemId);
      if (!card || this.environment.read().state.simple.mastered.has(card.id)) continue;
      const lessonId = this.environment.read().exposureLessonId;
      if (lessonId) {
        await upsertLessonCardExposure(lessonId, card.id);
        if (!active()) return;
      }
      // Failed exposure writes remain retryable and cannot advance mastery.
      updateProgress({ type: 'recitation-mastered', cardIds: [card.id] });
    }
    const state = this.environment.read().state;
    this.environment.update({ ...state, outcomes, simple: { ...state.simple, outcomes } }, true);
    this.environment.persistResume();
    if (
      [...cards.values()].every((card) =>
        this.environment.read().state.simple.mastered.has(card.id),
      )
    )
      this.environment.serveNext();
  };
}
