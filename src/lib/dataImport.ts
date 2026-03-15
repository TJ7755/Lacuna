import { getDb } from '../db/client';
import {
  card_note_links,
  card_tags,
  cards,
  decks,
  fsrs_state,
  notes,
  settings,
  tags,
} from '../db/schema';

type JsonObject = Record<string, unknown>;

type ImportResult = {
  imported: number;
  errors: string[];
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function parseDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asTableRows(root: JsonObject, key: string): JsonObject[] {
  const value = root[key];
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${key} is not an array.`);
  }

  return value.filter(isJsonObject);
}

function requiredString(row: JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required string field "${key}".`);
  }
  return value;
}

function nullableString(row: JsonObject, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

export async function importAllData(file: File): Promise<ImportResult> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;

  if (!isJsonObject(parsed)) {
    throw new Error('Import file is not a valid JSON object.');
  }

  if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
    throw new Error(
      'Import file must include at least "decks" and "cards" arrays.',
    );
  }

  const db = await getDb();
  const errors: string[] = [];
  let imported = 0;

  try {
    const rows = asTableRows(parsed, 'decks');
    for (const row of rows) {
      const payload: typeof decks.$inferInsert = {
        id: requiredString(row, 'id'),
        name: requiredString(row, 'name'),
        parent_id: nullableString(row, 'parent_id'),
        path: requiredString(row, 'path'),
        exam_date: parseDate(row.exam_date),
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(decks).values(payload).onConflictDoUpdate({
        target: decks.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(`decks: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const rows = asTableRows(parsed, 'cards');
    for (const row of rows) {
      const payload: typeof cards.$inferInsert = {
        id: requiredString(row, 'id'),
        deck_id: requiredString(row, 'deck_id'),
        card_type:
          row.card_type === 'basic' ||
          row.card_type === 'cloze' ||
          row.card_type === 'image_occlusion'
            ? row.card_type
            : 'basic',
        front: typeof row.front === 'string' ? row.front : '',
        back: typeof row.back === 'string' ? row.back : '',
        cloze_text: nullableString(row, 'cloze_text'),
        image_url: nullableString(row, 'image_url'),
        occlusion_data: row.occlusion_data,
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(cards).values(payload).onConflictDoUpdate({
        target: cards.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(`cards: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const rows = asTableRows(parsed, 'fsrs_state');
    for (const row of rows) {
      const payload: typeof fsrs_state.$inferInsert = {
        id: requiredString(row, 'id'),
        card_id: requiredString(row, 'card_id'),
        stability: typeof row.stability === 'number' ? row.stability : 0,
        difficulty: typeof row.difficulty === 'number' ? row.difficulty : 0,
        due: parseDate(row.due) ?? new Date(),
        last_review: parseDate(row.last_review),
        rating_history: parseStringArray(row.rating_history),
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(fsrs_state).values(payload).onConflictDoUpdate({
        target: fsrs_state.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(
      `fsrs_state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const rows = asTableRows(parsed, 'notes');
    for (const row of rows) {
      const payload: typeof notes.$inferInsert = {
        id: requiredString(row, 'id'),
        deck_id: nullableString(row, 'deck_id'),
        title: requiredString(row, 'title'),
        content: row.content ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(notes).values(payload).onConflictDoUpdate({
        target: notes.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(`notes: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const rows = asTableRows(parsed, 'card_note_links');
    for (const row of rows) {
      const payload: typeof card_note_links.$inferInsert = {
        id: requiredString(row, 'id'),
        card_id: requiredString(row, 'card_id'),
        note_id: requiredString(row, 'note_id'),
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(card_note_links).values(payload).onConflictDoUpdate({
        target: card_note_links.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(
      `card_note_links: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const rows = asTableRows(parsed, 'tags');
    for (const row of rows) {
      const payload: typeof tags.$inferInsert = {
        id: requiredString(row, 'id'),
        name: requiredString(row, 'name'),
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(tags).values(payload).onConflictDoUpdate({
        target: tags.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(`tags: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const rows = asTableRows(parsed, 'card_tags');
    for (const row of rows) {
      const payload: typeof card_tags.$inferInsert = {
        id: requiredString(row, 'id'),
        card_id: requiredString(row, 'card_id'),
        tag_id: requiredString(row, 'tag_id'),
        created_at: parseDate(row.created_at) ?? new Date(),
        updated_at: parseDate(row.updated_at) ?? new Date(),
        deleted_at: parseDate(row.deleted_at),
      };

      await db.insert(card_tags).values(payload).onConflictDoUpdate({
        target: card_tags.id,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(
      `card_tags: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const rows = asTableRows(parsed, 'settings');
    for (const row of rows) {
      const payload: typeof settings.$inferInsert = {
        key: requiredString(row, 'key'),
        value: typeof row.value === 'string' ? row.value : '',
        updated_at: parseDate(row.updated_at) ?? new Date(),
      };

      await db.insert(settings).values(payload).onConflictDoUpdate({
        target: settings.key,
        set: payload,
      });
      imported += 1;
    }
  } catch (err) {
    errors.push(
      `settings: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { imported, errors };
}
