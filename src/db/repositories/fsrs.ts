/**
 * FSRS state repository
 *
 * Manages the per-card FSRS scheduling state. Each card has exactly one
 * FSRS state row, created atomically alongside the card in `createCard`.
 */

import { eq } from 'drizzle-orm';
import { createEmptyCard } from 'ts-fsrs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { fsrs_state } from '../schema';

export type FsrsState = typeof fsrs_state.$inferSelect;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Returns the FSRS state for a card, or null if not found. */
export async function getCardState(cardId: string): Promise<FsrsState | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(fsrs_state)
    .where(eq(fsrs_state.card_id, cardId));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Creates the initial FSRS state for a newly created card.
 * Uses ts-fsrs's `createEmptyCard()` for the default scheduling values.
 * Must be called within the same transaction as the card insert.
 */
export async function initialiseCardState(cardId: string): Promise<FsrsState> {
  const db = await getDb();
  const empty = createEmptyCard();

  const [state] = await db
    .insert(fsrs_state)
    .values({
      id: uuidv4(),
      card_id: cardId,
      stability: empty.stability,
      difficulty: empty.difficulty,
      due: empty.due,
      last_review: empty.last_review ?? null,
      rating_history: [],
    })
    .returning();

  return state;
}

/**
 * Updates FSRS state after a review.
 * Called by the review engine — the caller is responsible for computing
 * the new scheduling values using ts-fsrs before calling this.
 */
export async function updateCardState(
  cardId: string,
  params: Partial<Omit<FsrsState, 'id' | 'card_id' | 'created_at'>>,
): Promise<FsrsState> {
  const db = await getDb();
  const now = new Date();

  await db
    .update(fsrs_state)
    .set({ ...params, updated_at: now })
    .where(eq(fsrs_state.card_id, cardId));

  const updated = await getCardState(cardId);
  if (!updated) {
    throw new Error(`[lacuna/fsrs] FSRS state not found for card: ${cardId}`);
  }
  return updated;
}
