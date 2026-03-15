import type { Deck } from '../../db/repositories/decks';
import { UI } from '../../ui-strings';
import styles from './DeckRow.module.css';

interface DeckRowProps {
  deck: Deck;
  cardCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  highlighted?: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  onDelete: () => void;
  onRename: () => void;
}

function formatExamDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-GB').format(date);
}

export function DeckRow({
  deck,
  cardCount,
  hasChildren,
  isExpanded,
  highlighted,
  onToggle,
  onNavigate,
  onDelete,
  onRename,
}: DeckRowProps) {
  const examDateStr = formatExamDate(deck.exam_date);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if the click was on a button inside the row.
    if ((e.target as HTMLElement).closest('button')) return;
    onNavigate();
  };

  return (
    <div
      className={`${styles.row} ${highlighted ? styles.rowHighlighted : ''}`}
      onClick={handleRowClick}
      role="row"
    >
      {hasChildren ? (
        <button
          className={styles.expandButton}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isExpanded ? UI.decks.collapse : UI.decks.expand}
          aria-expanded={isExpanded}
          type="button"
        >
          {isExpanded ? '-' : '+'}
        </button>
      ) : (
        <span className={styles.expandPlaceholder} aria-hidden="true" />
      )}

      <span className={styles.name}>{deck.name}</span>

      <span className={styles.meta}>
        <span className={styles.cardCount}>
          {UI.decks.cardCount(cardCount)}
        </span>
        {examDateStr && <span className={styles.examDate}>{examDateStr}</span>}
      </span>

      <span className={styles.actions}>
        <button
          className={styles.actionButton}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          aria-label={UI.decks.renameDeck}
        >
          {UI.decks.rename}
        </button>
        <button
          className={`${styles.actionButton} ${styles.danger}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={UI.decks.deleteDeck}
        >
          {UI.common.delete}
        </button>
      </span>
    </div>
  );
}
