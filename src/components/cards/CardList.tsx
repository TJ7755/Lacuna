import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card } from '../../db/repositories/cards';
import type { FsrsState } from '../../db/repositories/fsrs';
import type { Tag } from '../../db/repositories/tags';
import type { SequenceCard, SequenceItem } from '../../types';
import { useCardStore } from '../../store/cards';
import { useSequenceStore } from '../../store/sequences';
import { UI } from '../../ui-strings';
import { CardRow } from './CardRow';
import { CardEditor } from './CardEditor';
import { SequenceEditor } from './SequenceEditor';
import styles from './CardList.module.css';

interface CardListProps {
  deckId: string;
  cardsWithState: Array<{ card: Card; state: FsrsState }>;
  sequencesWithState?: Array<{
    card: SequenceCard;
    items: SequenceItem[];
    itemStates: FsrsState[];
    sequenceState: FsrsState;
  }>;
  cardTagsMap?: Record<string, Tag[]>;
}

export function CardList({
  deckId,
  cardsWithState,
  sequencesWithState = [],
  cardTagsMap,
}: CardListProps) {
  const { deleteCard } = useCardStore();
  const { deleteSequenceCard } = useSequenceStore();
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingSequence, setEditingSequence] = useState<
    (SequenceCard & { items: SequenceItem[] }) | null
  >(null);

  if (cardsWithState.length === 0 && sequencesWithState.length === 0) {
    return <p className={styles.empty}>{UI.cards.empty}</p>;
  }

  return (
    <>
      <motion.ul className={styles.list} layout role="list">
        <AnimatePresence initial={false}>
          {cardsWithState.map(({ card, state }) => (
            <motion.li
              key={card.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
            >
              <CardRow
                row={{
                  kind: 'card',
                  card,
                  state,
                  tags: cardTagsMap?.[card.id],
                }}
                onEdit={() => setEditingCard(card)}
                onDelete={() => void deleteCard(card.id)}
              />
            </motion.li>
          ))}

          {sequencesWithState.map((sequence) => (
            <motion.li
              key={sequence.card.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
            >
              <CardRow
                row={{
                  kind: 'sequence',
                  card: sequence.card,
                  items: sequence.items,
                  itemStates: sequence.itemStates,
                }}
                onEdit={() =>
                  setEditingSequence({
                    ...sequence.card,
                    items: sequence.items,
                  })
                }
                onDelete={() => void deleteSequenceCard(sequence.card.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {editingCard && (
        <CardEditor
          deckId={deckId}
          card={editingCard}
          onClose={() => setEditingCard(null)}
        />
      )}

      {editingSequence && (
        <div
          className={styles.sequenceEditorBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditingSequence(null);
            }
          }}
        >
          <div
            className={styles.sequenceEditorModal}
            role="dialog"
            aria-modal="true"
            aria-label={UI.sequence.typeLabel}
          >
            <div className={styles.sequenceEditorHeader}>
              <h2 className={styles.sequenceEditorTitle}>
                {UI.sequence.typeLabel}
              </h2>
              <button
                type="button"
                className={styles.sequenceEditorClose}
                onClick={() => setEditingSequence(null)}
                aria-label={UI.common.close}
              >
                ×
              </button>
            </div>
            <SequenceEditor
              deckId={deckId}
              sequenceCard={editingSequence}
              onSaved={() => setEditingSequence(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
