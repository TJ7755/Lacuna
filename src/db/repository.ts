// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { db, makeId } from './schema';
import type { Card, CardType, Deck, Grade, ReviewLog } from './types';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { emptyPerformance, updatePerformance } from '../fsrs/grading';
import { averagePredictedRetrievability } from '../fsrs/progress';
import { defaultExamDate } from '../utils/datetime';

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export async function createDeck(name: string): Promise<Deck> {
  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
    name: name.trim() || 'Untitled deck',
    examDate: defaultExamDate(createdAt),
    createdAt,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
  await db.decks.add(deck);
  await db.userPerformance.add(emptyPerformance(deck.id));
  return deck;
}

export async function updateDeck(id: string, changes: Partial<Deck>): Promise<void> {
  await db.decks.update(id, changes);
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      await db.cards.where('deckId').equals(id).delete();
      await db.sessionHistory.where('deckId').equals(id).delete();
      await db.userPerformance.delete(id);
      await db.decks.delete(id);
    },
  );
}

export async function deleteDecks(ids: string[]): Promise<void> {
  for (const id of ids) await deleteDeck(id);
}

/**
 * Merge several decks into a chosen target. The target keeps its name, exam date and
 * performance profile; all other decks' cards are reassigned to it, their session history
 * is concatenated onto the target, and the emptied decks are removed.
 */
export async function mergeDecks(sourceIds: string[], targetId: string): Promise<void> {
  const others = sourceIds.filter((id) => id !== targetId);
  if (others.length === 0) return;
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      for (const sourceId of others) {
        await db.cards.where('deckId').equals(sourceId).modify({ deckId: targetId });
        await db.sessionHistory
          .where('deckId')
          .equals(sourceId)
          .modify({ deckId: targetId });
        await db.userPerformance.delete(sourceId);
        await db.decks.delete(sourceId);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function createCard(
  deckId: string,
  type: CardType,
  front: string,
  back: string,
): Promise<Card> {
  const card: Card = {
    id: makeId(),
    deckId,
    type,
    front,
    back,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: Date.now(),
  };
  await db.cards.add(card);
  return card;
}

export async function updateCard(id: string, changes: Partial<Card>): Promise<void> {
  await db.cards.update(id, changes);
}

export async function deleteCards(ids: string[]): Promise<void> {
  await db.cards.bulkDelete(ids);
}

export async function moveCards(ids: string[], targetDeckId: string): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify({ deckId: targetDeckId });
  });
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface RecordReviewArgs {
  card: Card;
  deck: Deck;
  grade: Grade;
  responseTimeSec: number;
  distracted: boolean;
  /** Whether the answer was correct (grade > 1); drives per-deck calibration stats. */
  correct: boolean;
  now?: number;
}

/**
 * Record a single review: apply the FSRS update to the card, append a review log,
 * update the deck's calibration profile (correct reviews only), and write a
 * SessionHistory snapshot of the deck's average predicted exam-day retrievability.
 * Returns the updated card so callers can re-score the queue immediately.
 */
export async function recordReview(args: RecordReviewArgs): Promise<Card> {
  const { card, deck, grade, responseTimeSec, distracted, correct } = args;
  const now = args.now ?? Date.now();

  // All FSRS-6 maths is delegated to ts-fsrs via the engine wrapper.
  const engine = makeEngine(deck.fsrsParameters);
  const { memory, retrievabilityAtReview } = applyReview(engine, card, grade, now);

  const log: ReviewLog = {
    timestamp: now,
    grade,
    responseTimeSec,
    distracted,
    stabilityBefore: card.stability,
    stabilityAfter: memory.stability,
    difficultyBefore: card.difficulty,
    difficultyAfter: memory.difficulty,
    retrievabilityAtReview,
  };

  const updatedCard: Card = {
    ...card,
    stability: memory.stability,
    difficulty: memory.difficulty,
    lastReviewed: memory.lastReviewed,
    due: memory.due,
    scheduledDays: memory.scheduledDays,
    learningSteps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    history: [...card.history, log],
  };

  await db.transaction(
    'rw',
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      await db.cards.put(updatedCard);

      if (correct) {
        const perf =
          (await db.userPerformance.get(deck.id)) ?? emptyPerformance(deck.id);
        await db.userPerformance.put(updatePerformance(perf, responseTimeSec));
      }

      // Snapshot the deck's average predicted exam-day retrievability after this card.
      const deckCards = await db.cards.where('deckId').equals(deck.id).toArray();
      await db.sessionHistory.add({
        timestamp: now,
        deckId: deck.id,
        averagePredictedRetrievability: averagePredictedRetrievability(
          deckCards,
          deck,
        ),
      });
    },
  );

  return updatedCard;
}
