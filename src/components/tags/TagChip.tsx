/**
 * TagChip — a pill-shaped tag label.
 *
 * Renders in read-only mode when `onRemove` is omitted.
 * Renders with a remove button when `onRemove` is provided.
 * Renders as clickable when `onClick` is provided (e.g. for filtering).
 */

import type { Tag } from '../../db/repositories/tags';
import styles from './TagChip.module.css';

export interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}

export function TagChip({ tag, onRemove, onClick, active }: TagChipProps) {
  const chipClass = [
    styles.chip,
    onClick ? styles.clickable : '',
    active ? styles.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={chipClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className={styles.name}>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag.name}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
