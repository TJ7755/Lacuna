/**
 * FSRS wrapper — application-level interface for spaced-repetition scheduling.
 *
 * All interactions with ts-fsrs flow through this module. `Rating` from
 * ts-fsrs is not imported anywhere else in the codebase — use `ReviewRating`
 * (the string union) instead.
 */

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type Grade,
  type RecordLog,
} from 'ts-fsrs';
import type { FsrsState } from '../db/repositories/fsrs';
import type { Card } from '../db/repositories/cards';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four review ratings exposed to the rest of the codebase. */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/** A card together with its current FSRS scheduling state. */
export interface CardWithState {
  card: Card;
  state: FsrsState;
  /** For cloze cards with multiple indices: which deletion is being reviewed. */
  activeIndex?: number;
  /** For image occlusion cards: which rectangle is being tested. */
  activeRectId?: string;
  /** Plain-text note context from linked notes, used for LLM explanations. */
  noteContext?: string;
}

// ---------------------------------------------------------------------------
// Scheduler (module-private instance)
// ---------------------------------------------------------------------------

const _params = generatorParameters();
const _scheduler = fsrs(_params);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps the application-level string rating to the ts-fsrs Rating enum. */
export function toFsrsRating(rating: ReviewRating): Grade {
  switch (rating) {
    case 'again':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

/** Converts a stored FsrsState to the ts-fsrs Card shape the scheduler needs. */
function toFsrsCard(state: FsrsState): FsrsCard {
  const base = createEmptyCard();
  return {
    ...base,
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    last_review: state.last_review ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes scheduling results for all four ratings given a card's current
 * FSRS state. Returns a RecordLog keyed by ts-fsrs Rating enum values.
 */
export function scheduleCard(state: FsrsState): RecordLog {
  const card = toFsrsCard(state);
  return _scheduler.repeat(card, new Date());
}

/**
 * Returns predicted recall probability (0-1) for a card at a given date.
 * Returns 0 if the card has never been reviewed.
 */
export function getRetrievability(state: FsrsState, atDate: Date): number {
  if (!state.last_review) {
    return 0;
  }
  const card = toFsrsCard(state);
  return _scheduler.get_retrievability(card, atDate, false);
}

/**
 * Applies a rating to a card's FSRS state and returns the updated state.
 * Does not persist anything — the caller is responsible for writing to the
 * database.
 */
export function applyRating(state: FsrsState, rating: ReviewRating): FsrsState {
  const log = scheduleCard(state);
  const updated = log[toFsrsRating(rating)].card;
  return {
    ...state,
    stability: updated.stability,
    difficulty: updated.difficulty,
    due: updated.due,
    last_review: updated.last_review ?? null,
    updated_at: new Date(),
  };
}

/**
 * Filters a list of cards to those currently due for review (due <= now).
 */
export function getDueCards<T extends { state: FsrsState }>(cards: T[]): T[] {
  const now = new Date();
  return cards.filter((cs) => cs.state.due <= now);
}

/**
 * Returns the next review date for a given rating without applying it.
 * Used to populate the preview labels on rating buttons.
 */
export function previewNextReview(
  state: FsrsState,
  rating: ReviewRating,
): Date {
  const log = scheduleCard(state);
  return log[toFsrsRating(rating)].card.due;
}
