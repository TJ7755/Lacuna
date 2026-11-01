import type { Card, CardType, LessonCardExposure } from '@lacuna/core/db/types';

/**
 * A card as stored before FSRS-6: the new memory fields may be absent. `type` is
 * widened to also accept the retired `'typing'` card type (see migrateCardRecord),
 * which schema v13 folds into `'front_back'` — typing became a global answer-input
 * mode (src/state/answerInput.ts) rather than a card type.
 */
export type LegacyCard = Omit<
  Card,
  | 'conceptId'
  | 'reps'
  | 'lapses'
  | 'state'
  | 'due'
  | 'scheduledDays'
  | 'learningSteps'
  | 'type'
  | 'schedulingUnitId'
  | 'updatedAt'
> &
  Partial<
    Pick<
      Card,
      | 'conceptId'
      | 'reps'
      | 'lapses'
      | 'state'
      | 'due'
      | 'scheduledDays'
      | 'learningSteps'
      | 'updatedAt'
    >
  > & { type: Card['type'] | 'typing'; schedulingUnitId?: string };

/**
 * Bring a card record up to the FSRS-6 schema. The existing stability/difficulty
 * remain valid under FSRS-6; the new bookkeeping fields are derived from the
 * card's review history where possible.
 */
export function migrateCardRecord(card: LegacyCard): Card {
  const reps = card.reps ?? card.history.length;
  const lapses = card.lapses ?? card.history.filter((log) => log.grade === 1).length;
  // New cards are State.New (0); previously reviewed cards are treated as Review (2).
  const state = card.state ?? (card.lastReviewed === null ? 0 : 2);
  // The 'typing' card type was retired in schema v13: typed answering is now the
  // global 'type' presentation mode (src/state/answerInput.ts), not a card type.
  // A pre-v13 'typing' card is just a front_back card that happened to be answered
  // by typing, so it folds cleanly into front_back with no data loss.
  const type: CardType = card.type === 'typing' ? 'front_back' : (card.type as CardType);
  return {
    ...card,
    // This is only a temporary shape used by pre-v24 upgrade steps. Schema v24
    // replaces it with the stable, scope-aware Concept identity.
    conceptId: card.conceptId ?? `concept:pre-v24:${encodeURIComponent(card.id)}`,
    schedulingUnitId: card.schedulingUnitId ?? card.deckId ?? '',
    type,
    reps,
    lapses,
    state,
    // If a pre-FSRS-6 card has no due date, estimate it from stability rather than
    // defaulting to lastReviewed (which would make it immediately due).
    due:
      card.due ??
      (card.lastReviewed !== null &&
      card.lastReviewed !== undefined &&
      card.stability !== null &&
      card.stability !== undefined
        ? card.lastReviewed + Math.round(card.stability * 86_400_000)
        : card.lastReviewed),
    scheduledDays: card.scheduledDays ?? 0,
    learningSteps: card.learningSteps ?? 0,
    // Fields added after FSRS-6; default so older records and imports stay valid.
    tags: card.tags ?? [],
    suspended: card.suspended ?? false,
    buriedUntil: card.buriedUntil ?? null,
    updatedAt: card.updatedAt ?? card.createdAt,
  };
}

/**
 * Preserve pre-v12 lesson completion by exposing reviewed cards in their primary
 * lesson only. A display link is not evidence that the learner met the card there.
 */
export function buildLessonCardExposureBackfill(
  cards: Pick<Card, 'id' | 'primaryLessonId' | 'state' | 'lastReviewed' | 'createdAt'>[],
): LessonCardExposure[] {
  return cards.flatMap((card) => {
    if (card.state === 0 || typeof card.primaryLessonId !== 'string') return [];
    const taughtAt = card.lastReviewed ?? card.createdAt;
    return [
      {
        lessonId: card.primaryLessonId,
        cardId: card.id,
        taughtAt,
        updatedAt: taughtAt,
      },
    ];
  });
}
