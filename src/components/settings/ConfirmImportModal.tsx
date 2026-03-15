import { AnimatePresence, motion } from 'framer-motion';
import { UI } from '../../ui-strings';
import styles from './SettingsConfirmModal.module.css';

interface ConfirmImportModalProps {
  isOpen: boolean;
  fileName: string;
  importing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmImportModal({
  isOpen,
  fileName,
  importing,
  onClose,
  onConfirm,
}: ConfirmImportModalProps) {
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
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
            aria-label={UI.settings.importData}
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
                <h2 className={styles.title}>{UI.settings.importData}</h2>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={onClose}
                  aria-label={UI.common.close}
                >
                  {UI.common.close}
                </button>
              </header>

              <div className={styles.body}>
                <p className={styles.message}>{UI.settings.importConfirm}</p>
                <p className={styles.fileName}>{fileName}</p>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={onClose}
                  disabled={importing}
                >
                  {UI.common.cancel}
                </button>
                <button
                  type="button"
                  className={styles.confirmButton}
                  onClick={onConfirm}
                  disabled={importing}
                >
                  {UI.settings.importData}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
