import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useDeckStore } from '../store/decks';
import { getCardsByTag } from '../db/repositories/tags';
import { UI } from '../ui-strings';
import { DeckTree } from '../components/decks/DeckTree';
import { CreateDeckModal } from '../components/decks/CreateDeckModal';
import styles from './Decks.module.css';

export function Decks() {
  const { isReady, error: dbError } = useDb();
  const { decks, loading, error: deckError, fetchDecks } = useDeckStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const tagParam = searchParams.get('tag');
  const [highlightedDeckIds, setHighlightedDeckIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!isReady) return;
    void fetchDecks();
  }, [isReady, fetchDecks]);

  useEffect(() => {
    if (!isReady || !tagParam) return;
    void getCardsByTag(tagParam).then((cards) => {
      setHighlightedDeckIds(new Set(cards.map((c) => c.deck_id)));
    });
  }, [isReady, tagParam]);

  // Only apply highlights when a tag filter param is active.
  const effectiveHighlightedDeckIds = tagParam ? highlightedDeckIds : undefined;

  const renderContent = () => {
    if (!isReady || loading) {
      return <p className={styles.statusMessage}>{UI.decks.loading}</p>;
    }

    if (dbError || deckError) {
      return <p className={styles.errorMessage}>{UI.decks.errorLoad}</p>;
    }

    return (
      <DeckTree
        decks={decks}
        highlightedDeckIds={effectiveHighlightedDeckIds}
      />
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{UI.decks.heading}</h1>
        <button
          className={styles.newButton}
          type="button"
          onClick={() => setModalOpen(true)}
        >
          {UI.decks.createDeck}
        </button>
      </div>

      <div className={styles.content}>{renderContent()}</div>

      <CreateDeckModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        allDecks={decks}
      />
    </main>
  );
}
