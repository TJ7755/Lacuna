import { isNull } from 'drizzle-orm';
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

type ExportPayload = {
  decks: Array<typeof decks.$inferSelect>;
  cards: Array<typeof cards.$inferSelect>;
  fsrs_state: Array<typeof fsrs_state.$inferSelect>;
  notes: Array<typeof notes.$inferSelect>;
  card_note_links: Array<typeof card_note_links.$inferSelect>;
  tags: Array<typeof tags.$inferSelect>;
  card_tags: Array<typeof card_tags.$inferSelect>;
  settings: Array<typeof settings.$inferSelect>;
};

function buildFileName(): string {
  return `lacuna-export-${new Date().toISOString().slice(0, 10)}.json`;
}

function downloadJson(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = buildFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportAllData(): Promise<void> {
  const db = await getDb();

  const [
    exportDecks,
    exportCards,
    exportFsrsState,
    exportNotes,
    exportCardNoteLinks,
    exportTags,
    exportCardTags,
    exportSettings,
  ] = await Promise.all([
    db.select().from(decks).where(isNull(decks.deleted_at)),
    db.select().from(cards).where(isNull(cards.deleted_at)),
    db.select().from(fsrs_state).where(isNull(fsrs_state.deleted_at)),
    db.select().from(notes).where(isNull(notes.deleted_at)),
    db.select().from(card_note_links).where(isNull(card_note_links.deleted_at)),
    db.select().from(tags).where(isNull(tags.deleted_at)),
    db.select().from(card_tags).where(isNull(card_tags.deleted_at)),
    db.select().from(settings),
  ]);

  downloadJson({
    decks: exportDecks,
    cards: exportCards,
    fsrs_state: exportFsrsState,
    notes: exportNotes,
    card_note_links: exportCardNoteLinks,
    tags: exportTags,
    card_tags: exportCardTags,
    settings: exportSettings,
  });
}
