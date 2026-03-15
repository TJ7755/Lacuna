import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeckStore } from '../../store/decks';
import { UI } from '../../ui-strings';
import styles from './CreateDeckModal.module.css';

interface RenameDeckModalProps {
  isOpen: boolean;
  deckId: string;
  currentName: string;
  onClose: () => void;
}

export function RenameDeckModal({
  isOpen,
  deckId,
  currentName,
  onClose,
}: RenameDeckModalProps) {
  const { updateDeck } = useDeckStore();
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset and focus when the modal opens.
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await updateDeck(deckId, { name: trimmed });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
          <div
            className={styles.wrapper}
            role="dialog"
            aria-modal="true"
            aria-label={UI.decks.renameHeading}
            onClick={handleBackdropClick}
          >
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <div className={styles.header}>
                <h2 className={styles.title}>{UI.decks.renameHeading}</h2>
                <button
                  className={styles.closeButton}
                  type="button"
                  onClick={onClose}
                  aria-label={UI.common.close}
                >
                  x
                </button>
              </div>

              <form className={styles.body} onSubmit={handleSubmit}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rename-deck-name">
                    {UI.decks.newName}
                  </label>
                  <input
                    id="rename-deck-name"
                    ref={nameRef}
                    className={styles.input}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.footer}>
                  <button
                    className={styles.cancelButton}
                    type="button"
                    onClick={onClose}
                  >
                    {UI.common.cancel}
                  </button>
                  <button
                    className={styles.submitButton}
                    type="submit"
                    disabled={submitting || name.trim() === ''}
                  >
                    {UI.common.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
