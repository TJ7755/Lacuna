/**
 * CardList — displays the cards within a deck.
 * Each card is rendered as a `CardRow`. Deletions animate out with height
 * collapse via framer-motion's layout feature.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card } from '../../db/repositories/cards';
import type { FsrsState } from '../../db/repositories/fsrs';
import type { Tag } from '../../db/repositories/tags';
import { useCardStore } from '../../store/cards';
import { UI } from '../../ui-strings';
import { CardRow } from './CardRow';
import { CardEditor } from './CardEditor';
import styles from './CardList.module.css';

interface CardListProps {
  deckId: string;
  cardsWithState: Array<{ card: Card; state: FsrsState }>;
  cardTagsMap?: Record<string, Tag[]>;
}

export function CardList({
  deckId,
  cardsWithState,
  cardTagsMap,
}: CardListProps) {
  const { deleteCard } = useCardStore();
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  if (cardsWithState.length === 0) {
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
                card={card}
                state={state}
                tags={cardTagsMap?.[card.id]}
                onEdit={() => setEditingCard(card)}
                onDelete={() => void deleteCard(card.id)}
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
    </>
  );
}
