import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useDeckStore } from '../store/decks';
import { useReviewStore } from '../store/review';
import {
  currentCard,
  isSessionComplete,
  sessionSummary,
} from '../lib/reviewSession';
import { ReviewCard } from '../components/review/ReviewCard';
import { SessionProgress } from '../components/review/SessionProgress';
import { SessionComplete } from '../components/review/SessionComplete';
import { UI } from '../ui-strings';
import styles from './Review.module.css';

function formatExamDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB').format(date);
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getExamDaysLabel(examDate: Date): string {
  const today = startOfDay(new Date());
  const examDay = startOfDay(examDate);
  const diffDays = Math.round(
    (examDay.getTime() - today.getTime()) / 86_400_000,
  );

  if (diffDays < 0) return UI.review.examPast;
  if (diffDays === 0) return UI.review.examToday;
  return UI.review.examDaysToGo(diffDays);
}

export function Review() {
  const { deckId } = useParams<{ deckId?: string }>();
  const navigate = useNavigate();
  const { isReady } = useDb();
  const { decks } = useDeckStore();
  const {
    session,
    examMode,
    examModeSession,
    loading,
    error,
    deckDueCounts,
    startSession,
    clearSession,
    loadDueCounts,
    positionDrillEnabled,
    setPositionDrillEnabled,
  } = useReviewStore();

  // ---------------------------------------------------------------------------
  // Session start / cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isReady) return;

    if (deckId) {
      if (!session || session.deckId !== deckId) {
        void startSession(deckId, { positionDrill: positionDrillEnabled });
      }
    } else {
      void loadDueCounts(decks.map((d) => d.id));
    }

    return () => {
      clearSession();
    };
    // `startSession`, `loadDueCounts`, and `clearSession` are stable Zustand
    // action references that do not change between renders. Including them in
    // the dependency array would cause no additional re-runs in practice, but
    // the linter cannot verify referential stability of store actions. Omitting
    // them here is safe and intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, deckId, session, positionDrillEnabled]);

  // Reload due counts when deck list changes (deck-selection view only).
  useEffect(() => {
    if (!isReady || deckId) return;
    void loadDueCounts(decks.map((d) => d.id));
    // `loadDueCounts` is a stable Zustand action reference. Including it would
    // add no value since it never changes, but the linter cannot confirm this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, decks]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (!isReady || (loading && !session)) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{UI.common.loading}</p>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className={styles.page}>
        <p className={styles.errorMessage}>{UI.common.error}</p>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Active or completed session
  // ---------------------------------------------------------------------------

  if (session) {
    if (isSessionComplete(session)) {
      return <SessionComplete summary={sessionSummary(session)} />;
    }

    const current = currentCard(session);
    if (!current) {
      // Session exists but queue is empty (no due cards for the deck).
      return (
        <main className={styles.page}>
          <p className={styles.status}>{UI.review.noDueCards}</p>
          <p className={styles.detail}>{UI.review.noDueCardsDetail}</p>
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

    const reviewed = session.reviewed.length;
    const total = session.queue.length;

    return (
      <div className={styles.reviewLayout}>
        {examMode && examModeSession && (
          <div className={styles.examBanner}>
            {UI.review.examModeBannerFull(
              formatExamDate(examModeSession.examDate),
              getExamDaysLabel(examModeSession.examDate),
              Math.round(examModeSession.examReadiness * 100),
              Math.round(examModeSession.dailyBudgetMinutes),
            )}
          </div>
        )}
        <SessionProgress reviewed={reviewed} total={total} />
        <ReviewCard />
        {error && <p className={styles.inlineError}>{UI.common.error}</p>}
      </div>
    );
  }

  // No session yet but deckId was supplied and loading has ended — no due cards.
  if (deckId && !loading) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{UI.review.noDueCards}</p>
        <p className={styles.detail}>{UI.review.noDueCardsDetail}</p>
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

  // ---------------------------------------------------------------------------
  // Deck selection view (no deckId)
  // ---------------------------------------------------------------------------

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{UI.review.heading}</h1>

      {decks.length === 0 && (
        <p className={styles.status}>{UI.review.noDueCards}</p>
      )}

      <ul className={styles.deckList}>
        {decks.map((deck) => {
          const due = deckDueCounts[deck.id] ?? 0;
          return (
            <li key={deck.id} className={styles.deckItem}>
              <span className={styles.deckName}>{deck.name}</span>
              <span className={styles.dueCount}>{UI.review.dueCards(due)}</span>
              <button
                type="button"
                className={styles.startButton}
                disabled={due === 0}
                onClick={() => navigate(`/review/${deck.id}`)}
              >
                {UI.review.startRevision}
              </button>
            </li>
          );
        })}
      </ul>
      <label className={styles.positionDrillToggle}>
        <input
          type="checkbox"
          checked={positionDrillEnabled}
          onChange={(event) => setPositionDrillEnabled(event.target.checked)}
        />
        <span>{UI.sequence.positionDrillToggle}</span>
      </label>
    </main>
  );
}
