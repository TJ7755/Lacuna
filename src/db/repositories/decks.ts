/**
 * Deck repository
 *
 * All read operations filter on `deleted_at IS NULL` (soft deletes).
 * All delete operations set `deleted_at` rather than removing rows.
 */

import { eq, isNull, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { cards, decks, fsrs_state } from '../schema';

export type Deck = typeof decks.$inferSelect;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Returns all non-deleted decks as a flat list. */
export async function getAllDecks(): Promise<Deck[]> {
  const db = await getDb();
  return db.select().from(decks).where(isNull(decks.deleted_at));
}

/** Returns a single deck by id, or null if not found or soft-deleted. */
export async function getDeckById(id: string): Promise<Deck | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, id), isNull(decks.deleted_at)));
  return rows[0] ?? null;
}

/**
 * Returns the direct children of a deck (or top-level decks if parentId is
 * null), sorted by name ascending.
 */
export async function getChildDecks(parentId: string | null): Promise<Deck[]> {
  const db = await getDb();
  const condition =
    parentId === null
      ? and(isNull(decks.parent_id), isNull(decks.deleted_at))
      : and(eq(decks.parent_id, parentId), isNull(decks.deleted_at));

  return db.select().from(decks).where(condition);
}

/**
 * Returns the full ancestry chain for a deck — [root, ..., parent, self] —
 * by walking the parent_id chain. Used for breadcrumb rendering.
 */
export async function getDeckPath(id: string): Promise<Deck[]> {
  const path: Deck[] = [];
  let currentId: string | null = id;

  while (currentId !== null) {
    const deck = await getDeckById(currentId);
    if (!deck) break;
    path.unshift(deck);
    currentId = deck.parent_id;
  }

  return path;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Creates a new top-level or nested deck. */
export async function createDeck(params: {
  name: string;
  parentId?: string;
}): Promise<Deck> {
  const db = await getDb();
  const { name, parentId } = params;

  let path = name;
  if (parentId) {
    const parent = await getDeckById(parentId);
    if (!parent) {
      throw new Error(`[lacuna/decks] Parent deck not found: ${parentId}`);
    }
    path = `${parent.path}::${name}`;
  }

  const id = uuidv4();
  const [deck] = await db
    .insert(decks)
    .values({
      id,
      name,
      parent_id: parentId ?? null,
      path,
    })
    .returning();

  return deck;
}

/** Updates a deck's name and/or exam date. Rebuilds path strings after rename. */
export async function updateDeck(
  id: string,
  params: { name?: string; examDate?: Date | null },
): Promise<Deck> {
  const db = await getDb();
  const now = new Date();

  const setValues: Partial<typeof decks.$inferInsert> = { updated_at: now };

  if (params.name !== undefined) {
    setValues.name = params.name;
  }
  if ('examDate' in params) {
    setValues.exam_date = params.examDate ?? null;
  }

  await db.update(decks).set(setValues).where(eq(decks.id, id));

  if (params.name !== undefined) {
    await rebuildPaths(id);
  }

  const updated = await getDeckById(id);
  if (!updated) {
    throw new Error(`[lacuna/decks] Deck not found after update: ${id}`);
  }
  return updated;
}

/**
 * Soft-deletes a deck and all its descendants recursively, including all
 * cards belonging to those decks and their FSRS state rows.
 */
export async function deleteDeck(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  // 1. Collect all descendant IDs using the flat list (avoids recursive SQL).
  const all = await getAllDecks();
  const idsToDelete: string[] = [];

  const collect = (parentId: string): void => {
    idsToDelete.push(parentId);
    for (const deck of all) {
      if (deck.parent_id === parentId) {
        collect(deck.id);
      }
    }
  };

  collect(id);

  // 2. Collect affected card IDs so we can cascade to fsrs_state.
  const affectedCards = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(inArray(cards.deck_id, idsToDelete), isNull(cards.deleted_at)));

  const cardIds = affectedCards.map((c) => c.id);

  // 3. Soft-delete all affected cards.
  if (cardIds.length > 0) {
    await db
      .update(cards)
      .set({ deleted_at: now, updated_at: now })
      .where(inArray(cards.id, cardIds));

    // 4. Soft-delete all fsrs_state rows for affected cards.
    await db
      .update(fsrs_state)
      .set({ deleted_at: now, updated_at: now })
      .where(
        and(
          inArray(fsrs_state.card_id, cardIds),
          isNull(fsrs_state.deleted_at),
        ),
      );
  }

  // 5. Soft-delete all affected decks.
  for (const deckId of idsToDelete) {
    await db
      .update(decks)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(decks.id, deckId));
  }
}

/**
 * Recomputes the `path` field for a deck and all its live descendants.
 * Walks the parent_id chain to build the canonical path string.
 * Must be called after any rename or reparent operation.
 */
export async function rebuildPaths(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  const ancestors = await getDeckPath(id);
  if (ancestors.length === 0) return;

  const newPath = ancestors.map((d) => d.name).join('::');
  const currentDeck = ancestors[ancestors.length - 1];

  if (currentDeck.path !== newPath) {
    await db
      .update(decks)
      .set({ path: newPath, updated_at: now })
      .where(eq(decks.id, id));
  }

  // Recurse to live children.
  const children = await getChildDecks(id);
  for (const child of children) {
    await rebuildPaths(child.id);
  }
}
