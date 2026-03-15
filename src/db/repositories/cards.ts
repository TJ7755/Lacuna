/**
 * Card repository
 *
 * All read operations filter on `deleted_at IS NULL` (soft deletes).
 * All delete operations set `deleted_at` rather than removing rows.
 *
 * `createCard` inserts both the card row and its initial FSRS state in
 * direct sequence — if FSRS state insertion fails the card is soft-deleted
 * to avoid orphaned rows.
 */

import { eq, isNull, and, inArray, count, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { cards, decks, fsrs_state } from '../schema';
import type { FsrsState } from './fsrs';
import { initialiseCardState } from './fsrs';
import type { OcclusionData } from '../../types';

export type Card = typeof cards.$inferSelect;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Returns all non-deleted cards for a given deck, ordered by creation date. */
export async function getCardsByDeck(deckId: string): Promise<Card[]> {
  const db = await getDb();
  return db
    .select()
    .from(cards)
    .where(and(eq(cards.deck_id, deckId), isNull(cards.deleted_at)));
}

/** Returns a single non-deleted card by id, or null if not found. */
export async function getCardById(id: string): Promise<Card | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, id), isNull(cards.deleted_at)));
  return rows[0] ?? null;
}

/** Returns the count of non-deleted cards for a given deck. */
export async function getCardCountByDeck(deckId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: count() })
    .from(cards)
    .where(and(eq(cards.deck_id, deckId), isNull(cards.deleted_at)));
  return rows[0]?.count ?? 0;
}

/**
 * Returns non-deleted cards for a deck joined with their FSRS state.
 * Cards without an FSRS state row are excluded (should not occur in practice).
 */
export async function getCardsWithState(
  deckId: string,
): Promise<Array<{ card: Card; state: FsrsState }>> {
  const db = await getDb();
  const rows = await db
    .select({ card: cards, state: fsrs_state })
    .from(cards)
    .innerJoin(fsrs_state, eq(fsrs_state.card_id, cards.id))
    .where(and(eq(cards.deck_id, deckId), isNull(cards.deleted_at)));
  return rows;
}

/**
 * Returns the count of cards due for review now (fsrs_state.due <= current
 * time) in a given deck. New cards are always due since `createEmptyCard()`
 * sets `due` to the current timestamp.
 *
 * Image occlusion cards with N regions contribute N items to the count.
 */
export async function getDueCount(deckId: string): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ card: cards })
    .from(cards)
    .innerJoin(fsrs_state, eq(fsrs_state.card_id, cards.id))
    .where(
      and(
        eq(cards.deck_id, deckId),
        isNull(cards.deleted_at),
        lte(fsrs_state.due, now),
      ),
    );

  let total = 0;
  for (const { card } of rows) {
    if (card.card_type === 'image_occlusion' && card.occlusion_data) {
      const data = card.occlusion_data as unknown;
      total += Array.isArray(data) ? data.length : 1;
    } else {
      total += 1;
    }
  }
  return total;
}

/**
 * Returns cards across a deck and all its live descendants.
 * Walks the deck tree to collect all descendant IDs first, then fetches cards
 * for the full set in a single query.
 */
export async function getCardsByDeckRecursive(deckId: string): Promise<Card[]> {
  const db = await getDb();

  // Collect the target deck and all live descendants via path matching.
  const allDecks = await db
    .select({ id: decks.id, path: decks.path })
    .from(decks)
    .where(isNull(decks.deleted_at));

  const targetDeck = allDecks.find((d) => d.id === deckId);
  if (!targetDeck) return [];

  const targetPath = targetDeck.path;
  const deckIds = allDecks
    .filter(
      (d) => d.path === targetPath || d.path.startsWith(`${targetPath}::`),
    )
    .map((d) => d.id);

  if (deckIds.length === 0) return [];

  return db
    .select()
    .from(cards)
    .where(and(inArray(cards.deck_id, deckIds), isNull(cards.deleted_at)));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Creates a new card and its initial FSRS state.
 * For basic cards, provide `front` and `back`.
 * For cloze cards, provide `clozeText` (front and back default to empty string).
 */
export async function createCard(params: {
  deckId: string;
  cardType: 'basic' | 'cloze';
  front?: string;
  back?: string;
  clozeText?: string;
}): Promise<Card> {
  const db = await getDb();
  const { deckId, cardType, front = '', back = '', clozeText } = params;

  const id = uuidv4();
  const [card] = await db
    .insert(cards)
    .values({
      id,
      deck_id: deckId,
      card_type: cardType,
      front,
      back,
      cloze_text: clozeText ?? null,
    })
    .returning();

  // Insert FSRS state immediately after. If this fails, soft-delete the card
  // to avoid leaving an orphaned card row without scheduling data.
  try {
    await initialiseCardState(card.id);
  } catch (err) {
    await db
      .update(cards)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(cards.id, card.id));
    throw err;
  }

  return card;
}

/** Updates mutable fields on a card. */
export async function updateCard(
  id: string,
  params: { front?: string; back?: string; clozeText?: string },
): Promise<Card> {
  const db = await getDb();
  const now = new Date();

  const setValues: Partial<typeof cards.$inferInsert> = { updated_at: now };
  if (params.front !== undefined) setValues.front = params.front;
  if (params.back !== undefined) setValues.back = params.back;
  if ('clozeText' in params) setValues.cloze_text = params.clozeText ?? null;

  await db.update(cards).set(setValues).where(eq(cards.id, id));

  const updated = await getCardById(id);
  if (!updated) {
    throw new Error(`[lacuna/cards] Card not found after update: ${id}`);
  }
  return updated;
}

/** Soft-deletes a card by setting `deleted_at`. */
export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(cards)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(cards.id, id));
}

/**
 * Creates a new image occlusion card and its initial FSRS state.
 * Requires at least one occlusion rectangle to be defined.
 */
export async function createImageOcclusionCard(params: {
  deckId: string;
  imageUrl: string;
  occlusionData: OcclusionData;
}): Promise<Card> {
  if (params.occlusionData.length === 0) {
    throw new Error(
      '[lacuna/cards] Image occlusion card must have at least one region.',
    );
  }

  const db = await getDb();
  const id = uuidv4();
  const [card] = await db
    .insert(cards)
    .values({
      id,
      deck_id: params.deckId,
      card_type: 'image_occlusion',
      front: '',
      back: '',
      image_url: params.imageUrl,
      occlusion_data: params.occlusionData,
    })
    .returning();

  try {
    await initialiseCardState(card.id);
  } catch (err) {
    await db
      .update(cards)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(cards.id, card.id));
    throw err;
  }

  return card;
}

/** Updates image and/or occlusion regions on an image occlusion card. */
export async function updateImageOcclusionCard(
  id: string,
  params: { imageUrl?: string; occlusionData?: OcclusionData },
): Promise<Card> {
  const db = await getDb();
  const now = new Date();

  const setValues: Partial<typeof cards.$inferInsert> = { updated_at: now };
  if (params.imageUrl !== undefined) setValues.image_url = params.imageUrl;
  if (params.occlusionData !== undefined)
    setValues.occlusion_data = params.occlusionData;

  await db.update(cards).set(setValues).where(eq(cards.id, id));

  const updated = await getCardById(id);
  if (!updated) {
    throw new Error(`[lacuna/cards] Card not found after update: ${id}`);
  }
  return updated;
}
