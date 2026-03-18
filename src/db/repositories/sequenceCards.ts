import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
} from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { fsrs_state, sequence_cards, sequence_items } from '../schema';
import type { FsrsState } from './fsrs';
import { initialiseCardState } from './fsrs';

export type SequenceCard = typeof sequence_cards.$inferSelect;
export type SequenceItem = typeof sequence_items.$inferSelect;

export class SequenceLockedError extends Error {
  constructor() {
    super(
      'Item order cannot be changed after review has begun. You may still edit the title.',
    );
    this.name = 'SequenceLockedError';
  }
}

export async function createSequenceCard(params: {
  deckId: string;
  title: string;
  items: string[];
}): Promise<SequenceCard & { items: SequenceItem[] }> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date();

  const [card] = await db
    .insert(sequence_cards)
    .values({
      id,
      deck_id: params.deckId,
      title: params.title,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    .returning();

  const createdItems: SequenceItem[] = [];
  const initialisedCardIds: string[] = [];

  try {
    for (let index = 0; index < params.items.length; index += 1) {
      const [item] = await db
        .insert(sequence_items)
        .values({
          id: uuidv4(),
          sequence_card_id: card.id,
          position: index + 1,
          content: params.items[index],
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })
        .returning();
      createdItems.push(item);
    }

    for (const item of createdItems) {
      await initialiseCardState(item.id);
      initialisedCardIds.push(item.id);
    }

    await initialiseCardState(card.id);
    initialisedCardIds.push(card.id);

    return { ...card, items: createdItems };
  } catch (error) {
    const deletedAt = new Date();
    await db
      .update(sequence_items)
      .set({ deleted_at: deletedAt, updated_at: deletedAt })
      .where(eq(sequence_items.sequence_card_id, card.id));
    await db
      .update(sequence_cards)
      .set({ deleted_at: deletedAt, updated_at: deletedAt })
      .where(eq(sequence_cards.id, card.id));

    if (initialisedCardIds.length > 0) {
      await db
        .update(fsrs_state)
        .set({ deleted_at: deletedAt, updated_at: deletedAt })
        .where(inArray(fsrs_state.card_id, initialisedCardIds));
    }

    throw error;
  }
}

export async function getSequenceCardById(
  id: string,
): Promise<(SequenceCard & { items: SequenceItem[] }) | null> {
  const db = await getDb();
  const cards = await db
    .select()
    .from(sequence_cards)
    .where(and(eq(sequence_cards.id, id), isNull(sequence_cards.deleted_at)));
  const card = cards[0];
  if (!card) return null;

  const items = await db
    .select()
    .from(sequence_items)
    .where(
      and(
        eq(sequence_items.sequence_card_id, card.id),
        isNull(sequence_items.deleted_at),
      ),
    )
    .orderBy(asc(sequence_items.position));

  return { ...card, items };
}

export async function getSequenceCardsByDeck(
  deckId: string,
): Promise<Array<SequenceCard & { items: SequenceItem[] }>> {
  const db = await getDb();
  const cards = await db
    .select()
    .from(sequence_cards)
    .where(
      and(
        eq(sequence_cards.deck_id, deckId),
        isNull(sequence_cards.deleted_at),
      ),
    );

  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const items = await db
    .select()
    .from(sequence_items)
    .where(
      and(
        inArray(sequence_items.sequence_card_id, cardIds),
        isNull(sequence_items.deleted_at),
      ),
    )
    .orderBy(asc(sequence_items.position));

  return cards.map((card) => ({
    ...card,
    items: items.filter((item) => item.sequence_card_id === card.id),
  }));
}

export async function getSequenceCardsWithState(deckId: string): Promise<
  Array<{
    card: SequenceCard;
    items: SequenceItem[];
    itemStates: FsrsState[];
    sequenceState: FsrsState;
  }>
> {
  const db = await getDb();
  const cards = await db
    .select()
    .from(sequence_cards)
    .where(
      and(
        eq(sequence_cards.deck_id, deckId),
        isNull(sequence_cards.deleted_at),
      ),
    );
  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const items = await db
    .select()
    .from(sequence_items)
    .where(
      and(
        inArray(sequence_items.sequence_card_id, cardIds),
        isNull(sequence_items.deleted_at),
      ),
    )
    .orderBy(asc(sequence_items.position));

  const fsrsIds = [...cardIds, ...items.map((item) => item.id)];
  const states = await db
    .select()
    .from(fsrs_state)
    .where(
      and(inArray(fsrs_state.card_id, fsrsIds), isNull(fsrs_state.deleted_at)),
    );

  const stateByCardId = new Map(states.map((state) => [state.card_id, state]));

  return cards
    .map((card) => {
      const cardItems = items.filter(
        (item) => item.sequence_card_id === card.id,
      );
      const itemStates = cardItems
        .map((item) => stateByCardId.get(item.id))
        .filter((state): state is FsrsState => !!state);
      const sequenceState = stateByCardId.get(card.id);
      if (!sequenceState || itemStates.length !== cardItems.length) {
        return null;
      }
      return { card, items: cardItems, itemStates, sequenceState };
    })
    .filter(
      (
        row,
      ): row is {
        card: SequenceCard;
        items: SequenceItem[];
        itemStates: FsrsState[];
        sequenceState: FsrsState;
      } => row !== null,
    );
}

export async function updateSequenceCard(
  id: string,
  params: { title?: string; items?: string[] },
): Promise<SequenceCard & { items: SequenceItem[] }> {
  const db = await getDb();
  const now = new Date();

  if (params.title !== undefined) {
    await db
      .update(sequence_cards)
      .set({ title: params.title, updated_at: now })
      .where(eq(sequence_cards.id, id));
  }

  if (params.items !== undefined) {
    const existingItems = await db
      .select()
      .from(sequence_items)
      .where(
        and(
          eq(sequence_items.sequence_card_id, id),
          isNull(sequence_items.deleted_at),
        ),
      );

    if (existingItems.length > 0) {
      const reviewedStates = await db
        .select({ id: fsrs_state.id })
        .from(fsrs_state)
        .where(
          and(
            inArray(
              fsrs_state.card_id,
              existingItems.map((item) => item.id),
            ),
            isNull(fsrs_state.deleted_at),
            isNotNull(fsrs_state.last_review),
          ),
        );
      if (reviewedStates.length > 0) {
        throw new SequenceLockedError();
      }

      await db
        .update(sequence_items)
        .set({ deleted_at: now, updated_at: now })
        .where(eq(sequence_items.sequence_card_id, id));
      await db
        .update(fsrs_state)
        .set({ deleted_at: now, updated_at: now })
        .where(
          inArray(
            fsrs_state.card_id,
            existingItems.map((item) => item.id),
          ),
        );
    }

    for (let index = 0; index < params.items.length; index += 1) {
      const itemId = uuidv4();
      await db.insert(sequence_items).values({
        id: itemId,
        sequence_card_id: id,
        position: index + 1,
        content: params.items[index],
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await initialiseCardState(itemId);
    }
  }

  const updated = await getSequenceCardById(id);
  if (!updated) {
    throw new Error(
      `[lacuna/sequence] Sequence card not found after update: ${id}`,
    );
  }
  return updated;
}

export async function deleteSequenceCard(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const items = await db
    .select({ id: sequence_items.id })
    .from(sequence_items)
    .where(eq(sequence_items.sequence_card_id, id));
  const fsrsIds = [id, ...items.map((item) => item.id)];

  await db
    .update(sequence_cards)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(sequence_cards.id, id));
  await db
    .update(sequence_items)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(sequence_items.sequence_card_id, id));
  await db
    .update(fsrs_state)
    .set({ deleted_at: now, updated_at: now })
    .where(inArray(fsrs_state.card_id, fsrsIds));
}

export async function getSequenceDueCount(deckId: string): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ count: count() })
    .from(sequence_items)
    .innerJoin(
      sequence_cards,
      eq(sequence_cards.id, sequence_items.sequence_card_id),
    )
    .innerJoin(fsrs_state, eq(fsrs_state.card_id, sequence_items.id))
    .where(
      and(
        eq(sequence_cards.deck_id, deckId),
        isNull(sequence_cards.deleted_at),
        isNull(sequence_items.deleted_at),
        isNull(fsrs_state.deleted_at),
        lte(fsrs_state.due, now),
      ),
    );
  return rows[0]?.count ?? 0;
}
