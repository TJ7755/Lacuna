import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UI } from '../../ui-strings';
import styles from './SettingsConfirmModal.module.css';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  deleting,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [value, setValue] = useState('');
  const confirmWord = UI.settings.deleteAllConfirmWord;
  const canConfirm = value.trim() === confirmWord;

  const handleClose = () => {
    setValue('');
    onClose();
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
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
            aria-label={UI.settings.deleteAllData}
            onClick={handleBackdropClick}
          >
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <header className={styles.header}>
                <h2 className={styles.title}>{UI.settings.dangerZone}</h2>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={handleClose}
                  aria-label={UI.common.close}
                >
                  {UI.common.close}
                </button>
              </header>

              <div className={styles.body}>
                <p className={styles.message}>
                  {UI.settings.deleteAllDataConfirm}
                </p>
                <label className={styles.message} htmlFor="delete-all-confirm">
                  {UI.settings.deleteAllTypingPrompt}
                </label>
                <input
                  id="delete-all-confirm"
                  type="text"
                  className={styles.confirmInput}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={confirmWord}
                  autoComplete="off"
                />
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleClose}
                  disabled={deleting}
                >
                  {UI.common.cancel}
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={onConfirm}
                  disabled={deleting || !canConfirm}
                >
                  {UI.settings.deleteAllData}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
