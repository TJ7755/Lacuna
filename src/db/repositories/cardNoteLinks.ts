import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { card_note_links, cards, notes } from '../schema';
import type { Card } from './cards';
import type { Note } from './notes';

const EMPTY_DOCUMENT: object = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function parseContent(content: unknown): object {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as object)
        : EMPTY_DOCUMENT;
    } catch {
      return EMPTY_DOCUMENT;
    }
  }

  return typeof content === 'object' && content !== null
    ? (content as object)
    : EMPTY_DOCUMENT;
}

export async function linkCardToNote(
  cardId: string,
  noteId: string,
): Promise<void> {
  const db = await getDb();

  const existing = await db
    .select({ id: card_note_links.id })
    .from(card_note_links)
    .where(
      and(
        eq(card_note_links.card_id, cardId),
        eq(card_note_links.note_id, noteId),
        isNull(card_note_links.deleted_at),
      ),
    );

  if (existing.length > 0) {
    return;
  }

  await db.insert(card_note_links).values({
    id: uuidv4(),
    card_id: cardId,
    note_id: noteId,
  });
}

export async function unlinkCardFromNote(
  cardId: string,
  noteId: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db
    .update(card_note_links)
    .set({
      deleted_at: now,
      updated_at: now,
    })
    .where(
      and(
        eq(card_note_links.card_id, cardId),
        eq(card_note_links.note_id, noteId),
        isNull(card_note_links.deleted_at),
      ),
    );
}

export async function getLinkedNotes(cardId: string): Promise<Note[]> {
  const db = await getDb();

  const rows = await db
    .select({ note: notes })
    .from(card_note_links)
    .innerJoin(notes, eq(notes.id, card_note_links.note_id))
    .where(
      and(
        eq(card_note_links.card_id, cardId),
        isNull(card_note_links.deleted_at),
        isNull(notes.deleted_at),
      ),
    );

  return rows.map(({ note }) => ({
    ...note,
    content: parseContent(note.content),
  }));
}

export async function getLinkedCards(noteId: string): Promise<Card[]> {
  const db = await getDb();

  const rows = await db
    .select({ card: cards })
    .from(card_note_links)
    .innerJoin(cards, eq(cards.id, card_note_links.card_id))
    .where(
      and(
        eq(card_note_links.note_id, noteId),
        isNull(card_note_links.deleted_at),
        isNull(cards.deleted_at),
      ),
    );

  return rows.map(({ card }) => card);
}
