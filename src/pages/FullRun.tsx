import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSequenceStore } from '../store/sequences';
import { useDb } from '../hooks/useDb';
import { applyRating, type ReviewRating } from '../lib/fsrs';
import { updateCardState } from '../db/repositories/fsrs';
import { UI } from '../ui-strings';
import styles from './SequenceModes.module.css';

export function FullRun() {
  const { deckId, sequenceId } = useParams<{
    deckId: string;
    sequenceId?: string;
  }>();
  const navigate = useNavigate();
  const { isReady } = useDb();
  const { sequencesWithState, fetchSequencesByDeck } = useSequenceStore();
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isReady || !deckId) return;
    void fetchSequencesByDeck(deckId);
  }, [isReady, deckId, fetchSequencesByDeck]);

  const selectedSequence = useMemo(() => {
    if (!sequenceId) return null;
    return (
      sequencesWithState.find((sequence) => sequence.card.id === sequenceId) ??
      null
    );
  }, [sequenceId, sequencesWithState]);

  if (!deckId) return null;

  if (!sequenceId) {
    return (
      <main className={styles.page}>
        <h1>{UI.sequence.fullRunButton}</h1>
        <ul className={styles.chooser}>
          {sequencesWithState.map((sequence) => (
            <li key={sequence.card.id}>
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  navigate(`/review/${deckId}/fullrun/${sequence.card.id}`)
                }
              >
                {sequence.card.title}
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  if (!selectedSequence) {
    return (
      <main className={styles.page}>
        <p>{UI.common.notFound}</p>
      </main>
    );
  }

  const total = selectedSequence.items.length;
  const done = position >= total;

  const submit = async (rating: ReviewRating) => {
    setSaving(true);
    try {
      const next = applyRating(selectedSequence.sequenceState, rating);
      const now = new Date();
      await updateCardState(selectedSequence.card.id, {
        stability: next.stability,
        difficulty: next.difficulty,
        due: next.due,
        last_review: next.last_review,
        rating_history: [
          ...selectedSequence.sequenceState.rating_history,
          `${now.toISOString()}:${rating}`,
        ],
      });
      navigate(`/decks/${deckId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1>{selectedSequence.card.title}</h1>
      {!started ? (
        <button
          type="button"
          className={styles.primary}
          onClick={() => setStarted(true)}
        >
          {UI.sequence.fullRunBegin}
        </button>
      ) : done ? (
        <div className={styles.ratings}>
          <h2>{UI.sequence.fullRunComplete}</h2>
          <div className={styles.ratingRow}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit('again')}
            >
              {UI.review.again}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit('hard')}
            >
              {UI.review.hard}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit('good')}
            >
              {UI.review.good}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit('easy')}
            >
              {UI.review.easy}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.runBody}>
          <p className={styles.item}>
            {selectedSequence.items[position]?.content}
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => setPosition((value) => value + 1)}
          >
            {UI.sequence.fullRunNext}
          </button>
        </div>
      )}
    </main>
  );
}
