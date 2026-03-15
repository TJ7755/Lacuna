/**
 * Tags repository
 *
 * All read operations filter on `deleted_at IS NULL` (soft deletes).
 * Tag names are normalised (trim + lowercase) before any read or write.
 */

import { eq, isNull, and, inArray, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { tags, card_tags, cards } from '../schema';
import { normaliseTagName } from '../../lib/tags';

export type Tag = typeof tags.$inferSelect;
import type { Card } from './cards';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Returns all non-deleted tags, sorted alphabetically. */
export async function getAllTags(): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db.select().from(tags).where(isNull(tags.deleted_at));
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns all non-deleted tags for a specific card. */
export async function getTagsForCard(cardId: string): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db
    .select({ tag: tags })
    .from(card_tags)
    .innerJoin(tags, eq(tags.id, card_tags.tag_id))
    .where(
      and(
        eq(card_tags.card_id, cardId),
        isNull(card_tags.deleted_at),
        isNull(tags.deleted_at),
      ),
    );
  return rows.map((r) => r.tag);
}

/**
 * Batch-fetches tags for multiple cards in a single query.
 * Returns a map of cardId -> Tag[].
 */
export async function getTagsForCards(
  cardIds: string[],
): Promise<Record<string, Tag[]>> {
  if (cardIds.length === 0) return {};
  const db = await getDb();
  const rows = await db
    .select({ cardId: card_tags.card_id, tag: tags })
    .from(card_tags)
    .innerJoin(tags, eq(tags.id, card_tags.tag_id))
    .where(
      and(
        inArray(card_tags.card_id, cardIds),
        isNull(card_tags.deleted_at),
        isNull(tags.deleted_at),
      ),
    );

  const result: Record<string, Tag[]> = {};
  for (const row of rows) {
    if (!result[row.cardId]) result[row.cardId] = [];
    result[row.cardId].push(row.tag);
  }
  return result;
}

/** Returns all non-deleted cards that have a specific tag. */
export async function getCardsByTag(tagId: string): Promise<Card[]> {
  const db = await getDb();
  const rows = await db
    .select({ card: cards })
    .from(card_tags)
    .innerJoin(cards, eq(cards.id, card_tags.card_id))
    .where(
      and(
        eq(card_tags.tag_id, tagId),
        isNull(card_tags.deleted_at),
        isNull(cards.deleted_at),
      ),
    );
  return rows.map((r) => r.card);
}

/** Returns usage counts per tag (tagId -> count of non-deleted card_tags rows). */
export async function getTagUsageCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ tagId: card_tags.tag_id, count: count() })
    .from(card_tags)
    .where(isNull(card_tags.deleted_at))
    .groupBy(card_tags.tag_id);

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.tagId] = row.count;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Gets an existing tag by normalised name, or creates it. */
export async function getOrCreateTag(name: string): Promise<Tag> {
  const normalised = normaliseTagName(name);
  const db = await getDb();

  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.name, normalised), isNull(tags.deleted_at)));

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(tags)
    .values({ id: uuidv4(), name: normalised })
    .returning();
  return created;
}

/**
 * Adds a tag to a card (idempotent).
 * If the link already exists and is not soft-deleted, does nothing.
 */
export async function addTagToCard(
  cardId: string,
  tagName: string,
): Promise<void> {
  const tag = await getOrCreateTag(tagName);
  const db = await getDb();

  const existing = await db
    .select()
    .from(card_tags)
    .where(
      and(
        eq(card_tags.card_id, cardId),
        eq(card_tags.tag_id, tag.id),
        isNull(card_tags.deleted_at),
      ),
    );

  if (existing.length > 0) return;

  await db.insert(card_tags).values({
    id: uuidv4(),
    card_id: cardId,
    tag_id: tag.id,
  });
}

/** Soft-deletes the card_tags link for a specific card and tag. */
export async function removeTagFromCard(
  cardId: string,
  tagId: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(card_tags)
    .set({ deleted_at: now, updated_at: now })
    .where(
      and(
        eq(card_tags.card_id, cardId),
        eq(card_tags.tag_id, tagId),
        isNull(card_tags.deleted_at),
      ),
    );
}

/** Soft-deletes a tag and all its associated card_tags rows. */
export async function deleteTag(tagId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(card_tags)
    .set({ deleted_at: now, updated_at: now })
    .where(and(eq(card_tags.tag_id, tagId), isNull(card_tags.deleted_at)));
  await db
    .update(tags)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(tags.id, tagId));
}
