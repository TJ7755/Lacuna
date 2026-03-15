import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../db/repositories/notes';
import { generateCards, LlmNotConfiguredError } from '../../lib/llm/service';
import { tiptapToPlainText } from '../../lib/tiptapUtils';
import { useCardStore } from '../../store/cards';
import { useDeckStore } from '../../store/decks';
import { UI } from '../../ui-strings';
import styles from './GenerateCardsModal.module.css';

type CardType = 'basic' | 'cloze';

type GeneratedCard = {
  id: string;
  front?: string;
  back?: string;
  clozeText?: string;
  selected: boolean;
};

interface GenerateCardsModalProps {
  note: Note;
  onClose: () => void;
}

export function GenerateCardsModal({ note, onClose }: GenerateCardsModalProps) {
  const { decks } = useDeckStore();
  const { createCard } = useCardStore();

  const [cardType, setCardType] = useState<CardType>('basic');
  const [count, setCount] = useState(5);
  const [deckId, setDeckId] = useState(note.deck_id ?? decks[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [saving, setSaving] = useState(false);

  const sourceText = useMemo(
    () => tiptapToPlainText(note.content),
    [note.content],
  );

  const selectedCount = generated.filter((item) => item.selected).length;

  const toggleCard = (id: string) => {
    setGenerated((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const setAll = (selected: boolean) => {
    setGenerated((prev) => prev.map((item) => ({ ...item, selected })));
  };

  const handleGenerate = async () => {
    if (!deckId) {
      return;
    }

    setLoading(true);
    setError(null);
    setNotConfigured(false);

    try {
      const cards = await generateCards({
        text: sourceText,
        deckName: decks.find((deck) => deck.id === deckId)?.name ?? '',
        count,
        cardType,
      });

      setGenerated(
        cards.map((card, index) => ({
          id: `${Date.now()}-${index}`,
          ...card,
          selected: true,
        })),
      );
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        setNotConfigured(true);
        return;
      }

      setError(err instanceof Error ? err.message : UI.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const selected = generated.filter((item) => item.selected);
    if (!deckId || selected.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      for (const card of selected) {
        if (cardType === 'cloze') {
          await createCard({
            deckId,
            cardType: 'cloze',
            clozeText: card.clozeText,
          });
        } else {
          await createCard({
            deckId,
            cardType: 'basic',
            front: card.front,
            back: card.back,
          });
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI.common.error);
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.wrapper}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.backdrop} />
      <section className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>{UI.llm.generateCards}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            {UI.common.close}
          </button>
        </header>

        <div className={styles.formRow}>
          <label className={styles.label}>{UI.llm.cardType}</label>
          <div className={styles.segmented}>
            <button
              type="button"
              className={
                cardType === 'basic' ? styles.segmentActive : styles.segment
              }
              onClick={() => setCardType('basic')}
            >
              {UI.cards.typeBasic}
            </button>
            <button
              type="button"
              className={
                cardType === 'cloze' ? styles.segmentActive : styles.segment
              }
              onClick={() => setCardType('cloze')}
            >
              {UI.cards.typeCloze}
            </button>
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="generate-count">
            {UI.llm.cardCount}
          </label>
          <input
            id="generate-count"
            className={styles.input}
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) =>
              setCount(
                Math.max(1, Math.min(20, Number(event.target.value) || 1)),
              )
            }
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="generate-deck">
            {UI.llm.targetDeck}
          </label>
          <select
            id="generate-deck"
            className={styles.input}
            value={deckId}
            onChange={(event) => setDeckId(event.target.value)}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleGenerate()}
            disabled={loading || !deckId}
          >
            {loading ? UI.llm.generating : UI.llm.generateCards}
          </button>
          {loading && <span className={styles.spinner} aria-hidden="true" />}
        </div>

        {notConfigured && (
          <p className={styles.error}>
            {UI.settings.llmNotConfiguredHint}{' '}
            <Link to="/settings">{UI.settings.goToSettings}</Link>
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {generated.length > 0 && (
          <section className={styles.preview}>
            <div className={styles.previewHeader}>
              <h3 className={styles.previewTitle}>
                {UI.llm.generatedCardsPreview}
              </h3>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setAll(true)}
                >
                  {UI.llm.selectAll}
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setAll(false)}
                >
                  {UI.llm.deselectAll}
                </button>
              </div>
            </div>

            <ul className={styles.generatedList}>
              {generated.map((item) => (
                <li key={item.id} className={styles.generatedItem}>
                  <label className={styles.generatedCheck}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleCard(item.id)}
                    />
                  </label>
                  {cardType === 'cloze' ? (
                    <p className={styles.generatedText}>{item.clozeText}</p>
                  ) : (
                    <div className={styles.generatedPair}>
                      <p>{item.front}</p>
                      <p>{item.back}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleConfirm()}
              disabled={saving || selectedCount === 0}
            >
              {UI.llm.addSelected}
            </button>
          </section>
        )}
      </section>
    </div>
  );
}
