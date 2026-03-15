/**
 * CardRow — a single card in the deck detail card list.
 *
 * Shows type badge, truncated content preview, next due date, and
 * edit/delete action buttons. Clicking the row (not the buttons) triggers
 * the edit callback.
 */

import type { Card } from '../../db/repositories/cards';
import type { FsrsState } from '../../db/repositories/fsrs';
import type { Tag } from '../../db/repositories/tags';
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

function badgeClass(cardType: Card['card_type']): string {
  if (cardType === 'cloze') return styles.badgeCloze;
  if (cardType === 'image_occlusion') return styles.badgeImage;
  return styles.badgeBasic;
}

function badgeLabel(cardType: Card['card_type']): string {
  if (cardType === 'cloze') return UI.cards.typeCloze;
  if (cardType === 'image_occlusion') return UI.cards.typeImageOcclusion;
  return UI.cards.typeBasic;
}

interface CardRowProps {
  card: Card;
  state: FsrsState;
  tags?: Tag[];
  onEdit: () => void;
  onDelete: () => void;
}

export function CardRow({ card, state, tags, onEdit, onDelete }: CardRowProps) {
  const isNew = state.last_review === null;
  const dueLabel = isNew
    ? UI.cards.neverReviewed
    : UI.cards.nextDue(formatRelativeDuration(state.due));

  const handleRowClick = () => {
    onEdit();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(UI.cards.deleteConfirm)) {
      onDelete();
    }
  };

  return (
    <div
      className={styles.row}
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEdit();
      }}
    >
      <span className={`${styles.badge} ${badgeClass(card.card_type)}`}>
        {badgeLabel(card.card_type)}
      </span>

      <div className={styles.previewCol}>
        <span className={styles.preview}>{cardPreview(card)}</span>
        {tags && tags.length > 0 && (
          <div className={styles.tagRow}>
            {tags.map((tag) => (
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
