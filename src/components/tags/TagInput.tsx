/**
 * TagInput — inline tag editor.
 *
 * Operates in two modes:
 *
 * Edit mode: `cardId` is provided. Tag changes are persisted to the database
 * immediately. On mount the current tags for the card are loaded.
 *
 * Pending mode: `pendingTags` and `onPendingChange` are provided and
 * `cardId` is omitted. No DB calls are made — the tag list is local state
 * managed by the parent. Used in create-card flows where the card does not
 * yet exist.
 */

import { useState, useEffect, useRef } from 'react';
import type { Tag } from '../../db/repositories/tags';
import {
  getTagsForCard,
  addTagToCard,
  removeTagFromCard,
} from '../../db/repositories/tags';
import { normaliseTagName } from '../../lib/tags';
import { useTagStore } from '../../store/tags';
import { UI } from '../../ui-strings';
import { TagChip } from './TagChip';
import styles from './TagInput.module.css';

export interface TagInputProps {
  cardId?: string;
  pendingTags?: Tag[];
  onPendingChange?: (tags: Tag[]) => void;
  className?: string;
}

export function TagInput({
  cardId,
  pendingTags,
  onPendingChange,
  className,
}: TagInputProps) {
  const isPending = cardId === undefined;

  const { tags: allTags, fetchAllTags } = useTagStore();

  const [localTags, setLocalTags] = useState<Tag[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchAllTags();
  }, [fetchAllTags]);

  useEffect(() => {
    if (isPending || !cardId) return;
    void getTagsForCard(cardId).then(setLocalTags);
  }, [cardId, isPending]);

  const displayTags = isPending ? (pendingTags ?? []) : localTags;

  const normalised = normaliseTagName(inputValue);
  const suggestions =
    normalised.length > 0
      ? allTags.filter(
          (t) =>
            t.name.includes(normalised) &&
            !displayTags.some((dt) => dt.id === t.id),
        )
      : [];

  const showDropdown = suggestions.length > 0;

  const handleAdd = async (nameOrTag: string | Tag) => {
    const name =
      typeof nameOrTag === 'string'
        ? normaliseTagName(nameOrTag)
        : nameOrTag.name;
    if (!name) return;

    if (isPending) {
      const existing = allTags.find((t) => t.name === name);
      const tag: Tag = existing ?? {
        id: `pending-${name}`,
        name,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      if (!displayTags.some((t) => t.name === name)) {
        onPendingChange?.([...(pendingTags ?? []), tag]);
      }
    } else if (cardId) {
      await addTagToCard(cardId, name);
      const updated = await getTagsForCard(cardId);
      setLocalTags(updated);
      void fetchAllTags();
    }

    setInputValue('');
    setHighlightedIndex(-1);
  };

  const handleRemove = async (tag: Tag) => {
    if (isPending) {
      onPendingChange?.((pendingTags ?? []).filter((t) => t.id !== tag.id));
    } else if (cardId) {
      await removeTagFromCard(cardId, tag.id);
      setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
      void fetchAllTags();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        void handleAdd(suggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        void handleAdd(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setInputValue('');
      setHighlightedIndex(-1);
    } else if (e.key === 'Backspace' && inputValue === '') {
      if (displayTags.length > 0) {
        void handleRemove(displayTags[displayTags.length - 1]);
      }
    }
  };

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      {displayTags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          onRemove={() => void handleRemove(tag)}
        />
      ))}
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={inputValue}
          placeholder={
            displayTags.length === 0 ? UI.cards.tagPlaceholder : undefined
          }
          onChange={(e) => {
            setInputValue(e.target.value);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          aria-label={UI.cards.addTag}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {showDropdown && (
          <ul className={styles.dropdown} role="listbox">
            {suggestions.map((tag, i) => (
              <li
                key={tag.id}
                className={`${styles.dropdownItem} ${i === highlightedIndex ? styles.dropdownItemActive : ''}`}
                role="option"
                aria-selected={i === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleAdd(tag);
                }}
              >
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
