import { useNavigate } from 'react-router-dom';
import { UI } from '../../ui-strings';
import styles from './SessionComplete.module.css';

function formatMmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface SessionSummary {
  total: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  durationSeconds: number;
}

interface SessionCompleteProps {
  summary: SessionSummary;
}

export function SessionComplete({ summary }: SessionCompleteProps) {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{UI.review.sessionComplete}</h1>

      <div className={styles.stats}>
        <p className={styles.stat}>{UI.review.sessionTotal(summary.total)}</p>
        <p className={styles.stat}>
          {UI.review.sessionDuration(formatMmss(summary.durationSeconds))}
        </p>
      </div>

      <div className={styles.breakdown}>
        <div className={styles.breakdownRow}>
          <span className={styles.ratingLabel}>{UI.review.again}</span>
          <span className={styles.ratingCount}>{summary.again}</span>
        </div>
        <div className={styles.breakdownRow}>
          <span className={styles.ratingLabel}>{UI.review.hard}</span>
          <span className={styles.ratingCount}>{summary.hard}</span>
        </div>
        <div className={styles.breakdownRow}>
          <span className={styles.ratingLabel}>{UI.review.good}</span>
          <span className={styles.ratingCount}>{summary.good}</span>
        </div>
        <div className={styles.breakdownRow}>
          <span className={styles.ratingLabel}>{UI.review.easy}</span>
          <span className={styles.ratingCount}>{summary.easy}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate('/decks')}
      >
        {UI.review.backToDecks}
      </button>
    </main>
  );
}
