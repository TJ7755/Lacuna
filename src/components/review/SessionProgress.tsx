import { motion } from 'framer-motion';
import { UI } from '../../ui-strings';
import styles from './SessionProgress.module.css';

interface SessionProgressProps {
  reviewed: number;
  total: number;
}

export function SessionProgress({ reviewed, total }: SessionProgressProps) {
  const pct = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className={styles.container}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={reviewed}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <motion.div
          className={styles.fill}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        />
      </div>
      <span className={styles.counter}>
        {UI.review.sessionProgress(reviewed, total)}
      </span>
    </div>
  );
}
