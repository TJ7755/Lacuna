import type { Card } from '../../db/repositories/cards';
import type { FsrsState } from '../../db/repositories/fsrs';
import type { Tag } from '../../db/repositories/tags';
import type { SequenceCard, SequenceItem } from '../../types';
import { formatRelativeDuration } from '../../lib/formatDuration';
import { UI } from '../../ui-strings';
import { TagChip } from '../tags/TagChip';
import styles from './CardRow.module.css';

const PREVIEW_MAX = 80;

function truncate(text: string): string {
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX).trimEnd()}…`;
}

function cardPreview(card: Card): string {
  if (card.card_type === 'cloze') {
    return truncate(card.cloze_text ?? '');
  }
  if (card.card_type === 'image_occlusion') {
    const data = card.occlusion_data;
    const count = Array.isArray(data) ? data.length : 0;
    return UI.cards.occlusionRegionCount(count);
  }
  return truncate(card.front);
}

function badgeClass(cardType: Card['card_type'] | 'sequence'): string {
  if (cardType === 'cloze') return styles.badgeCloze;
  if (cardType === 'image_occlusion') return styles.badgeImage;
  if (cardType === 'sequence') return styles.badgeSequence;
  return styles.badgeBasic;
}

function badgeLabel(cardType: Card['card_type'] | 'sequence'): string {
  if (cardType === 'cloze') return UI.cards.typeCloze;
  if (cardType === 'image_occlusion') return UI.cards.typeImageOcclusion;
  if (cardType === 'sequence') return UI.sequence.typeLabel;
  return UI.cards.typeBasic;
}

type StandardCardRow = {
  kind: 'card';
  card: Card;
  state: FsrsState;
  tags?: Tag[];
};

type SequenceCardRow = {
  kind: 'sequence';
  card: SequenceCard;
  items: SequenceItem[];
  itemStates: FsrsState[];
};

interface CardRowProps {
  row: StandardCardRow | SequenceCardRow;
  onEdit: () => void;
  onDelete: () => void;
}

export function CardRow({ row, onEdit, onDelete }: CardRowProps) {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(UI.cards.deleteConfirm)) {
      onDelete();
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  if (row.kind === 'sequence') {
    const dueNow = row.itemStates.filter(
      (state) => state.due <= new Date(),
    ).length;
    const nextDue = row.itemStates
      .map((state) => state.due)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return (
      <div className={styles.row}>
        <span className={`${styles.badge} ${badgeClass('sequence')}`}>
          {badgeLabel('sequence')}
        </span>
        <div className={styles.previewCol}>
          <span className={styles.preview}>{row.card.title}</span>
          <div className={styles.sequenceMeta}>
            <span>{UI.sequence.itemCount(row.items.length)}</span>
            <span>{UI.sequence.dueCount(dueNow)}</span>
            {nextDue && (
              <span>{UI.cards.nextDue(formatRelativeDuration(nextDue))}</span>
            )}
          </div>
        </div>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleEditClick}
            aria-label={UI.cards.editCard}
          >
            {UI.common.edit}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={handleDeleteClick}
            aria-label={UI.cards.deleteCard}
          >
            {UI.common.delete}
          </button>
        </span>
      </div>
    );
  }

  const isNew = row.state.last_review === null;
  const dueLabel = isNew
    ? UI.cards.neverReviewed
    : UI.cards.nextDue(formatRelativeDuration(row.state.due));

  return (
    <div
      className={styles.row}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEdit();
      }}
    >
      <span className={`${styles.badge} ${badgeClass(row.card.card_type)}`}>
        {badgeLabel(row.card.card_type)}
      </span>

      <div className={styles.previewCol}>
        <span className={styles.preview}>{cardPreview(row.card)}</span>
        {row.tags && row.tags.length > 0 && (
          <div className={styles.tagRow}>
            {row.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>

      <span className={styles.due}>{dueLabel}</span>

      <span className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleEditClick}
          aria-label={UI.cards.editCard}
        >
          {UI.common.edit}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={handleDeleteClick}
          aria-label={UI.cards.deleteCard}
        >
          {UI.common.delete}
        </button>
      </span>
    </div>
  );
}
