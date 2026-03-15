import { AnimatePresence, motion } from 'framer-motion';
import { UI } from '../../ui-strings';
import styles from './ExamModeWarning.module.css';

interface ExamModeWarningProps {
  isOpen: boolean;
  message: string;
  onProceed: () => void;
  onCancel: () => void;
}

export function ExamModeWarning({
  isOpen,
  message,
  onProceed,
  onCancel,
}: ExamModeWarningProps) {
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onCancel();
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
            aria-hidden="true"
            onClick={handleBackdropClick}
          />
          <div
            className={styles.wrapper}
            role="dialog"
            aria-modal="true"
            aria-label={UI.review.startExamRevision}
            onClick={handleBackdropClick}
          >
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <p className={styles.message}>{message}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={onCancel}
                >
                  {UI.common.cancel}
                </button>
                <button
                  type="button"
                  className={styles.proceedButton}
                  onClick={onProceed}
                >
                  {UI.review.reviewWhatICan}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
