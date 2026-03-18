import { useMemo, useState } from 'react';
import { AnimatePresence, Reorder } from 'framer-motion';
import { useSequenceStore, SequenceLockedError } from '../../store/sequences';
import type { SequenceCard, SequenceItem } from '../../types';
import { UI } from '../../ui-strings';
import styles from './SequenceEditor.module.css';

interface SequenceEditorProps {
  deckId: string;
  sequenceCard?: SequenceCard & { items: SequenceItem[] };
  onSaved: () => void;
}

export function SequenceEditor({
  deckId,
  sequenceCard,
  onSaved,
}: SequenceEditorProps) {
  const isEdit = !!sequenceCard;
  const { createSequenceCard, updateSequenceCard } = useSequenceStore();
  const [title, setTitle] = useState(sequenceCard?.title ?? '');
  const [items, setItems] = useState(
    sequenceCard?.items.map((item) => item.content) ?? ['', ''],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalisedItems = useMemo(
    () => items.map((item) => item.trim()),
    [items],
  );

  const validate = (): string | null => {
    if (!title.trim()) return UI.sequence.titleRequired;
    if (normalisedItems.length < 2) return UI.sequence.itemsRequired;
    if (normalisedItems.some((item) => item.length === 0))
      return UI.sequence.emptyItem;
    return null;
  };

  const updateItem = (index: number, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && sequenceCard) {
        await updateSequenceCard(sequenceCard.id, {
          title: title.trim(),
          items: normalisedItems,
        });
      } else {
        await createSequenceCard({
          deckId,
          title: title.trim(),
          items: normalisedItems,
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof SequenceLockedError) {
        setError(UI.sequence.lockedError);
      } else {
        setError(err instanceof Error ? err.message : UI.common.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="sequence-title">
          {UI.sequence.titleLabel}
        </label>
        <input
          id="sequence-title"
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        className={styles.list}
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <Reorder.Item
              key={`${index}-${item}`}
              value={item}
              className={styles.item}
            >
              <span className={styles.index}>{index + 1}.</span>
              <textarea
                className={styles.textarea}
                value={item}
                onChange={(event) => updateItem(index, event.target.value)}
                onInput={(event) => {
                  const target = event.currentTarget;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                rows={1}
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() =>
                  setItems((prev) => prev.filter((_, i) => i !== index))
                }
                disabled={items.length <= 2}
              >
                {UI.sequence.deleteItem}
              </button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <button
        type="button"
        className={styles.addButton}
        onClick={() => setItems((prev) => [...prev, ''])}
      >
        {UI.sequence.addItem}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.saveButton} type="submit" disabled={submitting}>
        {UI.cards.saveCard}
      </button>
    </form>
  );
}
