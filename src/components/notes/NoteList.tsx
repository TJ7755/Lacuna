import { useDeckStore } from '../../store/decks';
import { formatRelativeDuration } from '../../lib/formatDuration';
import type { Note } from '../../db/repositories/notes';
import { UI } from '../../ui-strings';
import styles from './NoteList.module.css';

interface NoteListProps {
  notes: Note[];
  activeNoteId?: string;
  onSelect: (noteId: string) => void;
  onDelete: (noteId: string) => void;
}

export function NoteList({
  notes,
  activeNoteId,
  onSelect,
  onDelete,
}: NoteListProps) {
  const { decks } = useDeckStore();

  if (notes.length === 0) {
    return <p className={styles.empty}>{UI.notes.empty}</p>;
  }

  return (
    <ul className={styles.list}>
      {notes.map((note) => {
        const linkedDeck = note.deck_id
          ? decks.find((deck) => deck.id === note.deck_id)
          : null;
        const isActive = activeNoteId === note.id;

        return (
          <li key={note.id} className={styles.itemWrap}>
            <button
              type="button"
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`.trim()}
              onClick={() => onSelect(note.id)}
            >
              <span className={styles.title}>
                {note.title.trim() || UI.notes.untitled}
              </span>
              {linkedDeck && (
                <span className={styles.deckName}>{linkedDeck.name}</span>
              )}
              <span className={styles.updatedAt}>
                {formatRelativeDuration(note.updated_at)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className={styles.deleteButton}
              aria-label={UI.notes.deleteNote}
            >
              {UI.notes.deleteNote}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
