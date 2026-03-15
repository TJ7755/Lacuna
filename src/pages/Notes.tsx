import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NoteEditor } from '../components/notes/NoteEditor';
import { NoteList } from '../components/notes/NoteList';
import { GenerateCardsModal } from '../components/llm/GenerateCardsModal';
import { LlmNotConfiguredError, summariseNote } from '../lib/llm/service';
import { exportNoteToDocx } from '../lib/documents/exportDocx';
import { exportNoteToPdf } from '../lib/documents/exportPdf';
import { tiptapToPlainText } from '../lib/tiptapUtils';
import { useDb } from '../hooks/useDb';
import { useDeckStore } from '../store/decks';
import { useNoteStore } from '../store/notes';
import { UI } from '../ui-strings';
import styles from './Notes.module.css';

type SaveState = 'idle' | 'saving' | 'saved';
type SummaryLength = 'brief' | 'detailed';

const AUTOSAVE_MS = 1000;

export function Notes() {
  const { isReady } = useDb();
  const [searchParams, setSearchParams] = useSearchParams();
  const { fetchDecks } = useDeckStore();
  const {
    notes,
    currentNote,
    loading,
    error,
    fetchAllNotes,
    loadNote,
    createNote,
    updateNote,
    deleteNote,
  } = useNoteStore();

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('brief');
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const handledQueryNoteIdRef = useRef<string | null>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isReady) return;
    void Promise.all([fetchAllNotes(), fetchDecks()]);
  }, [isReady, fetchAllNotes, fetchDecks]);

  useEffect(() => {
    if (!isReady) return;

    const noteIdFromQuery = searchParams.get('note');
    if (!noteIdFromQuery) return;
    if (handledQueryNoteIdRef.current === noteIdFromQuery) return;

    handledQueryNoteIdRef.current = noteIdFromQuery;
    void loadNote(noteIdFromQuery);
  }, [isReady, searchParams, loadNote]);

  useEffect(() => {
    return () => {
      if (titleDebounceRef.current) {
        clearTimeout(titleDebounceRef.current);
      }

      if (contentDebounceRef.current) {
        clearTimeout(contentDebounceRef.current);
      }

      if (saveClearRef.current) {
        clearTimeout(saveClearRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSummaryOpen(false);
    setSummaryLength('brief');
    setSummaryText('');
    setSummaryError(null);
    setSummaryLoading(false);
  }, [currentNote?.id]);

  const scheduleSaveLabelReset = () => {
    if (saveClearRef.current) {
      clearTimeout(saveClearRef.current);
    }

    setSaveState('saved');
    saveClearRef.current = setTimeout(() => {
      setSaveState('idle');
    }, 2000);
  };

  const handleCreateNote = async () => {
    const created = await createNote({ title: UI.notes.untitled });
    await loadNote(created.id);
    setSearchParams({ note: created.id });

    requestAnimationFrame(() => {
      const titleInput = document.querySelector<HTMLInputElement>(
        '[data-note-title="true"]',
      );
      titleInput?.focus();
      titleInput?.select();
    });
  };

  const handleSelectNote = async (noteId: string) => {
    await loadNote(noteId);
    setSearchParams({ note: noteId });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm(UI.notes.deleteConfirm)) {
      return;
    }

    await deleteNote(noteId);

    if (currentNote?.id === noteId) {
      setSearchParams({});
      setSaveState('idle');
    }
  };

  const handleTitleChange = (title: string) => {
    const noteId = currentNote?.id;
    if (!noteId) return;

    setSaveState('saving');

    if (titleDebounceRef.current) {
      clearTimeout(titleDebounceRef.current);
    }

    titleDebounceRef.current = setTimeout(() => {
      void updateNote(noteId, { title })
        .then(() => {
          scheduleSaveLabelReset();
        })
        .catch(() => {
          setSaveState('idle');
        });
    }, AUTOSAVE_MS);
  };

  const handleContentChange = (content: object) => {
    const noteId = currentNote?.id;
    if (!noteId) return;

    setSaveState('saving');

    if (contentDebounceRef.current) {
      clearTimeout(contentDebounceRef.current);
    }

    contentDebounceRef.current = setTimeout(() => {
      void updateNote(noteId, { content })
        .then(() => {
          scheduleSaveLabelReset();
        })
        .catch(() => {
          setSaveState('idle');
        });
    }, AUTOSAVE_MS);
  };

  const handleImportAsContent = async (params: {
    title: string;
    content: object;
  }) => {
    const noteId = currentNote?.id;
    if (!noteId) {
      return;
    }

    setSaveState('saving');

    try {
      await updateNote(noteId, {
        title: params.title,
        content: params.content,
      });
      scheduleSaveLabelReset();
    } catch {
      setSaveState('idle');
      throw new Error(UI.common.error);
    }
  };

  const handleSummarise = async () => {
    if (!currentNote) {
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText('');

    try {
      const summary = await summariseNote({
        text: tiptapToPlainText(currentNote.content),
        targetLength: summaryLength,
      });
      setSummaryText(summary);
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        setSummaryError(UI.settings.llmNotConfiguredHint);
      } else {
        setSummaryError(err instanceof Error ? err.message : UI.common.error);
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  if (!isReady || loading) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>{UI.common.loading}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{UI.common.error}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <aside className={styles.leftPanel}>
        <div className={styles.leftHeader}>
          <h1 className={styles.heading}>{UI.notes.heading}</h1>
          <button
            type="button"
            className={styles.newButton}
            onClick={() => void handleCreateNote()}
          >
            {UI.notes.createNote}
          </button>
        </div>

        <div className={styles.listWrap}>
          <NoteList
            notes={notes}
            activeNoteId={currentNote?.id}
            onSelect={(noteId) => void handleSelectNote(noteId)}
            onDelete={(noteId) => void handleDeleteNote(noteId)}
          />
        </div>
      </aside>

      <section className={styles.rightPanel}>
        <div className={styles.rightHeader}>
          <div className={styles.rightHeaderPrimary}>
            {currentNote && (
              <button
                type="button"
                className={styles.generateButton}
                onClick={() => setGenerateOpen(true)}
              >
                {UI.llm.generateCards}
              </button>
            )}
            {currentNote && (
              <button
                type="button"
                className={styles.generateButton}
                onClick={() => setSummaryOpen(true)}
              >
                {UI.llm.summarise}
              </button>
            )}
          </div>

          <div className={styles.rightHeaderActions}>
            {currentNote ? (
              <>
                <button
                  type="button"
                  className={styles.exportButton}
                  onClick={() => void exportNoteToPdf(currentNote)}
                >
                  {UI.notes.exportAsPdf}
                </button>
                <button
                  type="button"
                  className={styles.exportButton}
                  onClick={() => void exportNoteToDocx(currentNote)}
                >
                  {UI.notes.exportAsDocx}
                </button>
              </>
            ) : null}

            <div className={styles.saveStatus}>
              {saveState === 'saving' ? UI.notes.saving : null}
              {saveState === 'saved' ? UI.notes.saved : null}
            </div>
          </div>
        </div>

        {currentNote && summaryOpen && (
          <section className={styles.summaryPanel}>
            <div className={styles.summaryHeader}>
              <h3 className={styles.summaryTitle}>{UI.notes.summarise}</h3>
              <button
                type="button"
                className={styles.summaryCloseButton}
                onClick={() => setSummaryOpen(false)}
              >
                {UI.llm.closeSummary}
              </button>
            </div>

            <div className={styles.summaryControls}>
              <button
                type="button"
                className={
                  summaryLength === 'brief'
                    ? styles.summarySegmentActive
                    : styles.summarySegment
                }
                onClick={() => setSummaryLength('brief')}
              >
                {UI.llm.summariseBrief}
              </button>
              <button
                type="button"
                className={
                  summaryLength === 'detailed'
                    ? styles.summarySegmentActive
                    : styles.summarySegment
                }
                onClick={() => setSummaryLength('detailed')}
              >
                {UI.llm.summariseDetailed}
              </button>
              <button
                type="button"
                className={styles.summaryActionButton}
                onClick={() => void handleSummarise()}
                disabled={summaryLoading}
              >
                {summaryLoading ? UI.llm.generating : UI.llm.summarise}
              </button>
            </div>

            {summaryError && (
              <p className={styles.summaryError}>{summaryError}</p>
            )}

            {summaryText && (
              <div className={styles.summaryResult}>
                <p className={styles.summaryResultLabel}>
                  {UI.llm.summariseResult}
                </p>
                <p className={styles.summaryResultText}>{summaryText}</p>
              </div>
            )}
          </section>
        )}

        {currentNote ? (
          <NoteEditor
            key={currentNote.id}
            note={currentNote}
            onTitleChange={handleTitleChange}
            onContentChange={handleContentChange}
            onImportAsContent={handleImportAsContent}
          />
        ) : (
          <p className={styles.emptyState}>
            {notes.length === 0 ? UI.notes.empty : UI.notes.noNoteSelected}
          </p>
        )}
      </section>

      {currentNote && generateOpen && (
        <GenerateCardsModal
          note={currentNote}
          onClose={() => setGenerateOpen(false)}
        />
      )}
    </main>
  );
}
