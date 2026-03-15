/**
 * Review session manager — pure state machine.
 *
 * No side effects. Does not touch the database or any Zustand store.
 * The review store in src/store/review.ts is responsible for calling these
 * functions and persisting results.
 */

import type { Card } from '../db/repositories/cards';
import type { CardWithState, ReviewRating } from './fsrs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewSession {
  deckId: string;
  /** Cards remaining to be reviewed in this session (linear queue). */
  queue: CardWithState[];
  /** Index of the current card in queue. */
  currentIndex: number;
  /** Cards already reviewed in this session. */
  reviewed: ReviewedCard[];
  startedAt: Date;
}

export interface ReviewedCard {
  card: Card;
  rating: ReviewRating;
  reviewedAt: Date;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Creates a new session from a list of due cards. */
export function createSession(
  deckId: string,
  dueCards: CardWithState[],
): ReviewSession {
  return {
    deckId,
    queue: [...dueCards],
    currentIndex: 0,
    reviewed: [],
    startedAt: new Date(),
  };
}

/** Returns the current card, or null if the session is complete. */
export function currentCard(session: ReviewSession): CardWithState | null {
  if (session.currentIndex >= session.queue.length) return null;
  return session.queue[session.currentIndex] ?? null;
}

/**
 * Records a rating for the current card and advances to the next.
 * Returns the updated session (immutable — does not mutate the input).
 */
export function advanceSession(
  session: ReviewSession,
  rating: ReviewRating,
): ReviewSession {
  const current = currentCard(session);
  if (!current) return session;

  const reviewedCard: ReviewedCard = {
    card: current.card,
    rating,
    reviewedAt: new Date(),
  };

  return {
    ...session,
    currentIndex: session.currentIndex + 1,
    reviewed: [...session.reviewed, reviewedCard],
  };
}

/** Returns true when all cards in the queue have been reviewed. */
export function isSessionComplete(session: ReviewSession): boolean {
  return session.currentIndex >= session.queue.length;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** Computes summary statistics for the end-of-session screen. */
export function sessionSummary(session: ReviewSession): {
  total: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  durationSeconds: number;
} {
  const durationSeconds = Math.floor(
    (Date.now() - session.startedAt.getTime()) / 1000,
  );

  const counts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of session.reviewed) {
    counts[r.rating]++;
  }

  return {
    total: session.reviewed.length,
    ...counts,
    durationSeconds,
  };
}
