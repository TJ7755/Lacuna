import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../client';
import { notes } from '../schema';

export type Note = Omit<typeof notes.$inferSelect, 'content'> & {
  content: object;
};

const EMPTY_DOCUMENT: object = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

function serialiseContent(content?: object): string {
  return JSON.stringify(content ?? EMPTY_DOCUMENT);
}

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

function mapNote(row: typeof notes.$inferSelect): Note {
  return {
    ...row,
    content: parseContent(row.content),
  };
}

export async function createNote(params: {
  title: string;
  deckId?: string;
  content?: object;
}): Promise<Note> {
  const db = await getDb();

  const [created] = await db
    .insert(notes)
    .values({
      id: uuidv4(),
      title: params.title,
      deck_id: params.deckId ?? null,
      content: serialiseContent(params.content),
    })
    .returning();

  return mapNote(created);
}

export async function getNoteById(id: string): Promise<Note | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deleted_at)));

  const row = rows[0];
  return row ? mapNote(row) : null;
}

export async function getAllNotes(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.select().from(notes).where(isNull(notes.deleted_at));
  return rows.map(mapNote);
}

export async function getNotesByDeck(deckId: string): Promise<Note[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.deck_id, deckId), isNull(notes.deleted_at)));

  return rows.map(mapNote);
}

export async function updateNote(
  id: string,
  params: {
    title?: string;
    deckId?: string | null;
    content?: object;
  },
): Promise<Note> {
  const db = await getDb();

  const values: Partial<typeof notes.$inferInsert> = {
    updated_at: new Date(),
  };

  if (params.title !== undefined) {
    values.title = params.title;
  }

  if ('deckId' in params) {
    values.deck_id = params.deckId ?? null;
  }

  if (params.content !== undefined) {
    values.content = serialiseContent(params.content);
  }

  await db.update(notes).set(values).where(eq(notes.id, id));

  const updated = await getNoteById(id);
  if (!updated) {
    throw new Error(`[lacuna/notes] Note not found after update: ${id}`);
  }

  return updated;
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db
    .update(notes)
    .set({
      deleted_at: now,
      updated_at: now,
    })
    .where(eq(notes.id, id));
}
