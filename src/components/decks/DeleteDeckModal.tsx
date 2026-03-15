import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeckStore } from '../../store/decks';
import { UI } from '../../ui-strings';
import styles from './CreateDeckModal.module.css';
import deleteStyles from './DeleteDeckModal.module.css';

interface DeleteDeckModalProps {
  isOpen: boolean;
  deckId: string;
  deckName: string;
  onClose: () => void;
}

export function DeleteDeckModal({
  isOpen,
  deckId,
  deckName,
  onClose,
}: DeleteDeckModalProps) {
  const { deleteDeck } = useDeckStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await deleteDeck(deckId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI.common.error);
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
            aria-label={UI.decks.deleteHeading}
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
                <h2 className={styles.title}>{UI.decks.deleteHeading}</h2>
                <button
                  className={styles.closeButton}
                  type="button"
                  onClick={onClose}
                  aria-label={UI.common.close}
                >
                  x
                </button>
              </div>

              <div className={styles.body}>
                <p className={deleteStyles.confirmMessage}>
                  {UI.decks.deleteConfirm(deckName)}
                </p>

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
                    className={deleteStyles.deleteButton}
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleConfirm()}
                  >
                    {UI.common.delete}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
