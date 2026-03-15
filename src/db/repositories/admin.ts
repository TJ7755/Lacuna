import {
  card_note_links,
  card_tags,
  cards,
  decks,
  fsrs_state,
  notes,
  settings,
  tags,
} from '../schema';
import { getDb } from '../client';

export async function softDeleteAllData(): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db.update(card_note_links).set({ deleted_at: now, updated_at: now });
  await db.update(card_tags).set({ deleted_at: now, updated_at: now });
  await db.update(fsrs_state).set({ deleted_at: now, updated_at: now });
  await db.update(cards).set({ deleted_at: now, updated_at: now });
  await db.update(notes).set({ deleted_at: now, updated_at: now });
  await db.update(tags).set({ deleted_at: now, updated_at: now });
  await db.update(decks).set({ deleted_at: now, updated_at: now });

  // settings currently has no deleted_at column.
  await db.delete(settings);
}
