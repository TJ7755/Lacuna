import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useSequenceStore } from '../store/sequences';
import { useReviewStore } from '../store/review';
import { UI } from '../ui-strings';
import styles from './SequenceModes.module.css';

export function LinesMode() {
  const { deckId, sequenceId } = useParams<{
    deckId: string;
    sequenceId?: string;
  }>();
  const navigate = useNavigate();
  const { isReady } = useDb();
  const { sequencesWithState, fetchSequencesByDeck } = useSequenceStore();
  const {
    linesMode,
    linesModeItems,
    linesModePosition,
    linesModeAutoAdvance,
    linesModeDelaySeconds,
    startLinesMode,
    advanceLinesMode,
    clearLinesMode,
  } = useReviewStore();
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!isReady || !deckId) return;
    void fetchSequencesByDeck(deckId);
  }, [isReady, deckId, fetchSequencesByDeck]);

  useEffect(() => {
    if (!linesMode || !revealed || !linesModeAutoAdvance) return;
    const timeout = window.setTimeout(
      () => {
        advanceLinesMode();
        setRevealed(false);
      },
      Math.max(1, linesModeDelaySeconds) * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    linesMode,
    revealed,
    linesModeAutoAdvance,
    linesModeDelaySeconds,
    advanceLinesMode,
  ]);

  useEffect(() => {
    return () => {
      clearLinesMode();
    };
  }, [clearLinesMode]);

  if (!deckId) return null;

  const selectedSequence = sequenceId
    ? (sequencesWithState.find((sequence) => sequence.card.id === sequenceId) ??
      null)
    : null;

  const prompt = !selectedSequence
    ? ''
    : linesModePosition === 0
      ? selectedSequence.card.title
      : (linesModeItems[linesModePosition - 1]?.content ?? '');

  if (!sequenceId) {
    return (
      <main className={styles.page}>
        <h1>{UI.sequence.linesChooseSequence}</h1>
        <ul className={styles.chooser}>
          {sequencesWithState.map((sequence) => (
            <li key={sequence.card.id}>
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  navigate(`/review/${deckId}/lines/${sequence.card.id}`)
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

  if (
    !linesMode &&
    linesModeItems.length > 0 &&
    linesModePosition >= linesModeItems.length
  ) {
    return (
      <main className={styles.page}>
        <h1>{UI.sequence.linesComplete}</h1>
        <p>{UI.sequence.linesItemCount(linesModeItems.length)}</p>
        <button
          type="button"
          className={styles.primary}
          onClick={() => navigate(`/decks/${deckId}`)}
        >
          {UI.review.backToDecks}
        </button>
      </main>
    );
  }

  if (!linesMode) {
    return (
      <main className={styles.page}>
        <h1>{selectedSequence.card.title}</h1>
        <div className={styles.options}>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(event) => setAutoAdvance(event.target.checked)}
            />
            {UI.sequence.linesAutoAdvance}
          </label>
          {autoAdvance && (
            <label className={styles.option}>
              {UI.sequence.linesDelay}
              <input
                type="number"
                min={1}
                max={10}
                value={delaySeconds}
                onChange={(event) =>
                  setDelaySeconds(
                    Math.max(1, Math.min(10, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={() =>
              void startLinesMode(selectedSequence.card.id, {
                autoAdvance,
                delaySeconds,
              })
            }
          >
            {UI.sequence.linesBegin}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1>{selectedSequence.card.title}</h1>
      <p className={styles.prompt}>{prompt}</p>
      {revealed ? (
        <>
          <p className={styles.answer}>
            {linesModeItems[linesModePosition]?.content}
          </p>
          {!linesModeAutoAdvance && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                advanceLinesMode();
                setRevealed(false);
              }}
            >
              {UI.sequence.linesNext}
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          className={styles.primary}
          onClick={() => setRevealed(true)}
        >
          {UI.review.showAnswer}
        </button>
      )}
    </main>
  );
}
