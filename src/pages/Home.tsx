import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useDeckStore } from '../store/decks';
import { useReviewStore } from '../store/review';
import { useTagStore } from '../store/tags';
import { UI } from '../ui-strings';
import { TagChip } from '../components/tags/TagChip';
import styles from './Home.module.css';

export function Home() {
  const { isReady } = useDb();
  const navigate = useNavigate();
  const { decks, fetchDecks } = useDeckStore();
  const { deckDueCounts, loadDueCounts, examModeSessions } = useReviewStore();
  const { tags, tagUsageCounts, fetchAllTags } = useTagStore();

  useEffect(() => {
    if (!isReady) return;
    void fetchDecks();
  }, [isReady, fetchDecks]);

  useEffect(() => {
    if (!isReady || decks.length === 0) return;
    void loadDueCounts(decks.map((d) => d.id));
  }, [isReady, decks, loadDueCounts]);

  useEffect(() => {
    if (!isReady) return;
    void fetchAllTags();
  }, [isReady, fetchAllTags]);

  const totalDue = Object.values(deckDueCounts).reduce((sum, n) => sum + n, 0);

  // Find the nearest upcoming exam deck that has a cached session.
  // Use daysRemaining from cached sessions to avoid impure Date.now() in render.
  const nearestExamDeck = useMemo(
    () =>
      decks
        .filter((d) => {
          const session = examModeSessions[d.id];
          return session && session.daysRemaining >= 0;
        })
        .sort(
          (a, b) =>
            examModeSessions[a.id].daysRemaining -
            examModeSessions[b.id].daysRemaining,
        )[0],
    [decks, examModeSessions],
  );

  const nearestSession = nearestExamDeck
    ? examModeSessions[nearestExamDeck.id]
    : null;

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{UI.home.heading}</h1>
      <p className={styles.dueCount}>{UI.home.dueToday(totalDue)}</p>
      {nearestSession && nearestExamDeck && (
        <p className={styles.upcomingExam}>
          {UI.home.upcomingExam(
            nearestExamDeck.name,
            nearestSession.daysRemaining,
            Math.round(nearestSession.examReadiness * 100),
          )}
        </p>
      )}
      {totalDue === 0 && <p className={styles.noDue}>{UI.home.noCardsDue}</p>}
      <div className={styles.actions}>
        <Link
          to="/review"
          className={
            totalDue === 0
              ? `${styles.primaryButton} ${styles.primaryButtonDisabled}`
              : styles.primaryButton
          }
          aria-disabled={totalDue === 0}
          onClick={(e) => {
            if (totalDue === 0) e.preventDefault();
          }}
        >
          {UI.home.startReview}
        </Link>
        <Link to="/decks" className={styles.secondaryButton}>
          {UI.home.viewDecks}
        </Link>
      </div>

      {tags.length > 0 && (
        <section className={styles.tagsSection}>
          <h2 className={styles.tagsHeading}>{UI.tags.heading}</h2>
          <div className={styles.tagList}>
            {tags.map((tag) => (
              <span key={tag.id} className={styles.tagItem}>
                <TagChip
                  tag={tag}
                  onClick={() => navigate(`/decks?tag=${tag.id}`)}
                />
                <span className={styles.tagCount}>
                  {UI.tags.usageCount(tagUsageCounts[tag.id] ?? 0)}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
