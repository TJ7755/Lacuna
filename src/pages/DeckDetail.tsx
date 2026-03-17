import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { useDeckStore } from '../store/decks';
import { useCardStore } from '../store/cards';
import { useNoteStore } from '../store/notes';
import { useReviewStore } from '../store/review';
import { buildExamModeSession, type ExamModeSession } from '../lib/exam-mode';
import { getTagsForCards } from '../db/repositories/tags';
import type { Tag } from '../db/repositories/tags';
import { UI } from '../ui-strings';
import { CardList } from '../components/cards/CardList';
import { CardEditor } from '../components/cards/CardEditor';
import { TagChip } from '../components/tags/TagChip';
import { PracticeTestModal } from '../components/llm/PracticeTestModal';
import { ExamModeWarning } from '../components/review/ExamModeWarning';
import { exportDeckAsJson, exportDeckAsText } from '../lib/deckExport';
import styles from './DeckDetail.module.css';

function formatExamDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-GB').format(date);
}

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function isPastExamDate(date: Date | null): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDay = new Date(date);
  examDay.setHours(0, 0, 0, 0);
  return examDay.getTime() < today.getTime();
}

export function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isReady } = useDb();
  const { decks, updateDeck } = useDeckStore();
  const { startExamSession } = useReviewStore();
  const {
    cardsWithState,
    dueCount,
    loading: cardsLoading,
    error: cardsError,
    fetchCardsByDeck,
  } = useCardStore();
  const {
    notes,
    loading: notesLoading,
    error: notesError,
    fetchNotesByDeck,
    createNote,
  } = useNoteStore();
  const [addingCard, setAddingCard] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [startingExam, setStartingExam] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [pendingExamSession, setPendingExamSession] =
    useState<ExamModeSession | null>(null);
  const [examActionError, setExamActionError] = useState<string | null>(null);
  const [cardTagsMap, setCardTagsMap] = useState<Record<string, Tag[]>>({});
  const [activeFilterTagIds, setActiveFilterTagIds] = useState<Set<string>>(
    new Set(),
  );
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const deck = id ? decks.find((d) => d.id === id) : undefined;

  useEffect(() => {
    if (!isReady || !id) return;
    void fetchCardsByDeck(id);
  }, [isReady, id, fetchCardsByDeck]);

  useEffect(() => {
    if (!isReady || !id) return;
    void fetchNotesByDeck(id);
  }, [isReady, id, fetchNotesByDeck]);

  // Fetch tags for all loaded cards in a single batch query.
  useEffect(() => {
    if (cardsWithState.length === 0) {
      setCardTagsMap({});
      return;
    }
    const cardIds = cardsWithState.map((cs) => cs.card.id);
    void getTagsForCards(cardIds).then(setCardTagsMap);
  }, [cardsWithState]);

  if (!isReady) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{UI.common.loading}</p>
      </main>
    );
  }

  if (!deck || !id) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{UI.common.notFound}</p>
      </main>
    );
  }

  const breadcrumbParts = deck.path.split('::');
  const examDateStr = formatExamDate(deck.exam_date);
  const examDatePast = isPastExamDate(deck.exam_date);

  // Collect all unique tags that appear on any card in this deck.
  const allDeckTags: Tag[] = [];
  const seenTagIds = new Set<string>();
  for (const tags of Object.values(cardTagsMap)) {
    for (const tag of tags) {
      if (!seenTagIds.has(tag.id)) {
        seenTagIds.add(tag.id);
        allDeckTags.push(tag);
      }
    }
  }
  allDeckTags.sort((a, b) => a.name.localeCompare(b.name));

  // Filter cards client-side — AND logic across all active filter tags.
  const filteredCards =
    activeFilterTagIds.size === 0
      ? cardsWithState
      : cardsWithState.filter((cs) => {
          const cardTags = cardTagsMap[cs.card.id] ?? [];
          const cardTagIds = new Set(cardTags.map((t) => t.id));
          for (const filterId of activeFilterTagIds) {
            if (!cardTagIds.has(filterId)) return false;
          }
          return true;
        });

  const toggleFilter = (tagId: string) => {
    setActiveFilterTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleCreateDeckNote = async () => {
    const created = await createNote({ title: UI.notes.untitled, deckId: id });
    navigate(`/notes?note=${created.id}`);
  };

  const handleExamDateChange = async (value: string) => {
    if (!id) return;
    setExamActionError(null);
    try {
      await updateDeck(id, { examDate: parseDateInput(value) });
    } catch {
      setExamActionError(UI.common.error);
    }
  };

  const handleClearExamDate = async () => {
    if (!id) return;
    setExamActionError(null);
    try {
      await updateDeck(id, { examDate: null });
    } catch {
      setExamActionError(UI.common.error);
    }
  };

  const handleStartExamRevision = async () => {
    if (!id || !deck.exam_date || examDatePast) return;
    setExamActionError(null);
    setStartingExam(true);
    try {
      const session = await buildExamModeSession(id, deck.exam_date);
      if (session.estimatedReviewable < session.cards.length) {
        setPendingExamSession(session);
        setWarningOpen(true);
        return;
      }

      await startExamSession(id);
      navigate(`/review/${id}`);
    } catch {
      setExamActionError(UI.common.error);
    } finally {
      setStartingExam(false);
    }
  };

  const handleProceedWarning = async () => {
    if (!id) return;
    setWarningOpen(false);
    setStartingExam(true);
    setExamActionError(null);
    try {
      await startExamSession(id);
      navigate(`/review/${id}`);
    } catch {
      setExamActionError(UI.common.error);
    } finally {
      setStartingExam(false);
      setPendingExamSession(null);
    }
  };

  const handleCancelWarning = () => {
    setWarningOpen(false);
    setPendingExamSession(null);
  };

  const handleExportJson = async () => {
    if (!id) return;
    setExportNotice(null);
    await exportDeckAsJson(id);
  };

  const handleExportText = async () => {
    if (!id) return;
    await exportDeckAsText(id);
    setExportNotice(UI.decks.exportTextSkipsOcclusion);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Deck path">
          {breadcrumbParts.map((part, i) => (
            <span key={i} className={styles.breadcrumbPart}>
              {i > 0 && (
                <span className={styles.breadcrumbSeparator} aria-hidden="true">
                  {UI.decks.pathSeparator}
                </span>
              )}
              <span
                className={
                  i === breadcrumbParts.length - 1
                    ? styles.breadcrumbCurrent
                    : styles.breadcrumbAncestor
                }
              >
                {part}
              </span>
            </span>
          ))}
        </nav>

        <h1 className={styles.heading}>{deck.name}</h1>

        <div className={styles.meta}>
          <span className={styles.cardCount}>
            {UI.cards.cardCount(cardsWithState.length)}
            {' — '}
            {UI.cards.dueCount(dueCount)}
          </span>
          {examDateStr && (
            <span className={styles.examDate}>
              {UI.decks.examDate}: {examDateStr}
            </span>
          )}
        </div>
      </header>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => navigate(`/review/${id}`)}
          disabled={dueCount === 0}
        >
          {UI.review.startRevision}
        </button>
        {deck.exam_date && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleStartExamRevision()}
            disabled={examDatePast || startingExam}
            title={examDatePast ? UI.decks.examDatePast : undefined}
          >
            {UI.decks.examRevision}
          </button>
        )}
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setPracticeOpen(true)}
        >
          {UI.llm.practiceTest}
        </button>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setAddingCard(true)}
        >
          {UI.cards.addCard}
        </button>
        <details className={styles.exportMenu}>
          <summary className={styles.secondaryButton}>
            {UI.decks.exportDeck}
          </summary>
          <div className={styles.exportMenuItems}>
            <button
              type="button"
              className={styles.exportMenuButton}
              onClick={() => void handleExportJson()}
            >
              {UI.decks.exportAsJson}
            </button>
            <button
              type="button"
              className={styles.exportMenuButton}
              onClick={() => void handleExportText()}
            >
              {UI.decks.exportAsText}
            </button>
          </div>
        </details>
      </div>

      {exportNotice && <p className={styles.status}>{exportNotice}</p>}

      <section className={styles.examDateControls}>
        <label className={styles.examDateLabel} htmlFor="deck-exam-date">
          {UI.decks.setExamDate}
        </label>
        <div className={styles.examDateActions}>
          <input
            id="deck-exam-date"
            className={styles.dateInput}
            type="date"
            value={toDateInputValue(deck.exam_date)}
            onChange={(event) => void handleExamDateChange(event.target.value)}
            aria-label={UI.decks.examDateLabel}
          />
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleClearExamDate()}
            disabled={!deck.exam_date}
          >
            {UI.decks.clearExamDate}
          </button>
          {examDatePast && (
            <span className={styles.examDateHint}>{UI.decks.examDatePast}</span>
          )}
        </div>
        {examActionError && (
          <p className={styles.errorMessage}>{examActionError}</p>
        )}
      </section>

      <section className={styles.cardSection}>
        {cardsLoading && <p className={styles.status}>{UI.cards.loading}</p>}
        {cardsError && (
          <p className={styles.errorMessage}>{UI.cards.errorLoad}</p>
        )}
        {!cardsLoading && !cardsError && (
          <>
            {allDeckTags.length > 0 && (
              <div className={styles.tagFilters}>
                {allDeckTags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    active={activeFilterTagIds.has(tag.id)}
                    onClick={() => toggleFilter(tag.id)}
                  />
                ))}
                {activeFilterTagIds.size > 0 && (
                  <>
                    <span className={styles.filteringByLabel}>
                      {UI.tags.filteringBy(activeFilterTagIds.size)}
                    </span>
                    <button
                      type="button"
                      className={styles.clearFiltersButton}
                      onClick={() => setActiveFilterTagIds(new Set())}
                    >
                      {UI.tags.clearFilters}
                    </button>
                  </>
                )}
              </div>
            )}
            <CardList
              deckId={id}
              cardsWithState={filteredCards}
              cardTagsMap={cardTagsMap}
            />
          </>
        )}
      </section>

      <section className={styles.notesSection}>
        <div className={styles.notesHeader}>
          <h2 className={styles.notesHeading}>{UI.notes.linkedNotes}</h2>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleCreateDeckNote()}
          >
            {UI.notes.newNoteForDeck}
          </button>
        </div>

        {notesLoading && <p className={styles.status}>{UI.common.loading}</p>}
        {notesError && <p className={styles.errorMessage}>{UI.common.error}</p>}
        {!notesLoading && !notesError && notes.length === 0 && (
          <p className={styles.status}>{UI.notes.empty}</p>
        )}
        {!notesLoading && !notesError && notes.length > 0 && (
          <ul className={styles.noteLinks}>
            {notes.map((note) => (
              <li key={note.id}>
                <Link to={`/notes?note=${note.id}`}>
                  {note.title.trim() || UI.notes.untitled}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {addingCard && (
        <CardEditor deckId={id} onClose={() => setAddingCard(false)} />
      )}

      {practiceOpen && (
        <PracticeTestModal
          subject={deck.name}
          cards={cardsWithState}
          notes={notes}
          onClose={() => setPracticeOpen(false)}
        />
      )}

      {pendingExamSession && (
        <ExamModeWarning
          isOpen={warningOpen}
          message={UI.review.examModeCapacityWarning(
            pendingExamSession.estimatedReviewable,
            pendingExamSession.cards.length,
            formatExamDate(pendingExamSession.examDate) ?? '',
          )}
          onProceed={() => void handleProceedWarning()}
          onCancel={handleCancelWarning}
        />
      )}
    </main>
  );
}
