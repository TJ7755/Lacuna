// Lesson view page — shows a lesson's notes and cards with full CRUD on notes.
// Route: /course/:courseId/lesson/:lessonId
// Also renderable inline by CoursePath when a course has exactly one lesson
// (via optional courseId/lessonId props that take precedence over route params).
// British English throughout.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { db } from '../db/schema';
import { useCourse, useNotes, useLessonCards } from '../state/useCourseData';
import { useDeck } from '../state/useData';
import { CardList } from '../components/cards/CardList';
import { LessonNoteEditor } from '../components/notes/LessonNoteEditor';
import { MarkdownView } from '../components/markdown/MarkdownView';
import { Button } from '../components/ui/Button';
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  PlayIcon,
} from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import {
  createNote,
  updateNote,
  deleteNote,
  reorderNotes,
} from '../db/repository';
import type { Lesson, Note } from '../db/types';

interface LessonViewProps {
  /**
   * When provided (inline single-lesson branch from CoursePath), takes precedence
   * over the route param. The back link also changes to the dashboard rather than
   * the course path, since there is no path to go back to.
   */
  courseId?: string;
  /** Same precedence rule as courseId above. */
  lessonId?: string;
}

export function LessonView({ courseId: courseIdProp, lessonId: lessonIdProp }: LessonViewProps) {
  const params = useParams<{ courseId: string; lessonId: string }>();
  // Props take precedence over route params (single-lesson inline branch).
  const courseId = courseIdProp ?? params.courseId;
  const lessonId = lessonIdProp ?? params.lessonId;
  // The component is rendered inline when props were supplied by CoursePath.
  const isInline = courseIdProp !== undefined;

  const navigate = useNavigate();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Use a null-sentinel to distinguish loading (undefined) from not found (null).
  // When lessonId is absent the query resolves immediately to null.
  const lesson = useLiveQuery<Lesson | null>(
    () =>
      lessonId
        ? db.lessons.get(lessonId).then((l) => l ?? null)
        : Promise.resolve(null),
    [lessonId],
  );
  const course = useCourse(courseId);
  const notes = useNotes(lessonId);
  const lessonCards = useLessonCards(lessonId);

  // Derive the deck id from the lesson's cards (all cards in a migrated lesson share
  // the same deckId). Used for the Study button bridge and CardList deck prop.
  const lessonDeckId = lessonCards?.[0]?.deckId;
  const lessonDeck = useDeck(lessonDeckId);

  // Note editing state.
  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  // Per-note deletion confirm state; holds the id of the note awaiting confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Note expand/collapse state — mirrors the LessonNotes collapsible pattern.
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(() => new Set());

  // Loading state.
  if (
    lesson === undefined ||
    course === undefined ||
    notes === undefined ||
    lessonCards === undefined
  ) {
    return <LessonViewSkeleton />;
  }

  // Not found.
  if (lesson === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-10"
      >
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
          <Link
            to={courseId ? `/course/${courseId}` : '/'}
            className="text-accent underline"
          >
            {courseId ? 'Back to course' : 'Back to dashboard'}
          </Link>
        </div>
      </motion.div>
    );
  }

  // Notes sorted by orderIndex for display and reorder operations.
  const sortedNotes = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);

  // Back link: course path when navigating normally; dashboard when rendered inline
  // for a single-lesson course (no path to navigate back to).
  const backTo = isInline ? '/' : `/course/${courseId}`;
  const backLabel = isInline ? 'Dashboard' : 'Course';

  // ---------------------------------------------------------------------------
  // Note handlers
  // ---------------------------------------------------------------------------

  async function handleAddNote(data: { name: string; content: string }) {
    if (!lessonId) return;
    setNoteBusy(true);
    try {
      await createNote(lessonId, data.name, data.content);
      setAddingNote(false);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleEditNote(
    noteId: string,
    data: { name: string; content: string },
  ) {
    setNoteBusy(true);
    try {
      await updateNote(noteId, { name: data.name, content: data.content });
      setEditingNoteId(null);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    setConfirmDeleteId(null);
    await deleteNote(noteId);
  }

  async function handleMoveNote(noteId: string, direction: 'up' | 'down') {
    if (!lessonId) return;
    const idx = sortedNotes.findIndex((n) => n.id === noteId);
    if (direction === 'up' && idx <= 0) return;
    if (direction === 'down' && idx >= sortedNotes.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const ordered = sortedNotes.map((n) => n.id);
    [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];
    await reorderNotes(lessonId, ordered);
  }

  function toggleNoteOpen(id: string) {
    setOpenNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <Link
        to={backTo}
        className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        {backLabel}
      </Link>

      {/* Header */}
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">
          {lesson.name}
        </h1>
        {lesson.description && (
          <p className="mt-2 text-sm text-ink-soft">{lesson.description}</p>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Notes section                                                        */}
      {/* ------------------------------------------------------------------ */}
      {/*
       * Each note is rendered as a collapsible row (title + chevron) with edit,
       * delete, and reorder controls alongside the title. Expanding the row reveals
       * the Markdown content. This replicates the LessonNotes collapsible pattern
       * and extends it with CRUD affordances.
       */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">Notes</h2>
          {!addingNote && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAddingNote(true);
                setEditingNoteId(null);
              }}
            >
              <PlusIcon width={16} height={16} />
              Add note
            </Button>
          )}
        </div>

        {/* New-note form */}
        {addingNote && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.14 * m, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-line-strong bg-surface p-5">
              <LessonNoteEditor
                onSave={handleAddNote}
                onCancel={() => setAddingNote(false)}
                busy={noteBusy}
              />
            </div>
          </motion.div>
        )}

        {/* Existing notes */}
        {sortedNotes.length > 0 ? (
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {sortedNotes.map((note, idx) => (
              <NoteRow
                key={note.id}
                note={note}
                isOpen={openNoteIds.has(note.id)}
                isEditing={editingNoteId === note.id}
                isFirst={idx === 0}
                isLast={idx === sortedNotes.length - 1}
                confirmingDelete={confirmDeleteId === note.id}
                noteBusy={noteBusy && editingNoteId === note.id}
                motionMultiplier={m}
                onToggle={() => {
                  if (editingNoteId === note.id) return;
                  toggleNoteOpen(note.id);
                }}
                onEdit={() => {
                  setEditingNoteId(note.id);
                  setOpenNoteIds((prev) => {
                    const next = new Set(prev);
                    next.delete(note.id);
                    return next;
                  });
                }}
                onEditSave={(data) => handleEditNote(note.id, data)}
                onEditCancel={() => setEditingNoteId(null)}
                onDeleteRequest={() => setConfirmDeleteId(note.id)}
                onDeleteConfirm={() => handleDeleteNote(note.id)}
                onDeleteCancel={() => setConfirmDeleteId(null)}
                onMoveUp={() => handleMoveNote(note.id, 'up')}
                onMoveDown={() => handleMoveNote(note.id, 'down')}
              />
            ))}
          </div>
        ) : !addingNote ? (
          <div className="rounded-xl border border-dashed border-line-strong py-12 text-center">
            <p className="text-sm text-ink-soft">No notes yet. Add one to get started.</p>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Cards section                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">
            Cards{' '}
            <span className="text-ink-faint">({lessonCards.length})</span>
          </h2>
          {/*
           * Study bridge: navigates to the existing deck-based LearnMode using the
           * lesson's underlying deck. This is a temporary bridge until the
           * course/lesson-aware LearnMode lands in a later phase.
           */}
          {lessonCards.length > 0 && lessonDeckId && (
            <Button
              variant="primary"
              onClick={() => navigate(`/deck/${lessonDeckId}/learn`)}
            >
              <PlayIcon width={18} height={18} />
              Study
            </Button>
          )}
        </div>

        {lessonCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong py-12 text-center">
            <p className="text-sm text-ink-soft">No cards in this lesson yet.</p>
          </div>
        ) : lessonDeck ? (
          <CardList
            cards={lessonCards}
            deck={lessonDeck}
            allDecks={[lessonDeck]}
            onEditCard={(card) =>
              navigate(`/deck/${lessonDeck.id}/cards/${card.id}/edit`)
            }
          />
        ) : (
          // Deck is still resolving; show a brief skeleton rather than blocking the page.
          <div className="space-y-3">
            {Array.from({ length: Math.min(lessonCards.length, 3) }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl border border-line bg-ink/5"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteRow
// ---------------------------------------------------------------------------

interface NoteRowProps {
  note: Note;
  isOpen: boolean;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  confirmingDelete: boolean;
  noteBusy: boolean;
  motionMultiplier: number;
  onToggle: () => void;
  onEdit: () => void;
  onEditSave: (data: { name: string; content: string }) => void | Promise<void>;
  onEditCancel: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function NoteRow({
  note,
  isOpen,
  isEditing,
  isFirst,
  isLast,
  confirmingDelete,
  noteBusy,
  motionMultiplier: m,
  onToggle,
  onEdit,
  onEditSave,
  onEditCancel,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onMoveUp,
  onMoveDown,
}: NoteRowProps) {
  if (isEditing) {
    return (
      <div className="p-5">
        <LessonNoteEditor
          note={note}
          onSave={onEditSave}
          onCancel={onEditCancel}
          busy={noteBusy}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Title row */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Expand / collapse toggle */}
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
        >
          <motion.span
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={{ duration: 0.15 * m }}
            className="shrink-0 text-ink-faint"
          >
            <ChevronDownIcon width={14} height={14} />
          </motion.span>
          <span className="flex-1 font-medium text-ink">{note.name}</span>
        </button>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-0.5">
          {confirmingDelete ? (
            // Inline two-step deletion confirm — no window.confirm() needed.
            <>
              <span className="mr-1 text-xs text-ink-soft">Delete?</span>
              <button
                type="button"
                onClick={onDeleteConfirm}
                className="min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium text-negative transition-colors hover:bg-negative/10"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="min-h-9 rounded-lg px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-ink/5"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                title="Move up"
                className={cn(
                  'flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
                  'disabled:pointer-events-none disabled:opacity-30',
                )}
              >
                <ChevronDownIcon
                  width={14}
                  height={14}
                  className="rotate-180"
                />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                title="Move down"
                className={cn(
                  'flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink',
                  'disabled:pointer-events-none disabled:opacity-30',
                )}
              >
                <ChevronDownIcon width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={onEdit}
                title="Edit note"
                className="flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-accent"
              >
                <EditIcon width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={onDeleteRequest}
                title="Delete note"
                className="flex h-9 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 * m }}
          className="border-t border-line px-5 py-4"
        >
          <MarkdownView source={note.content} allowEmbeds />
        </motion.div>
      )}
    </div>
  );
}

function LessonViewSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-20 animate-pulse rounded bg-ink/10" />
      <div className="mb-8">
        <div className="h-10 w-72 animate-pulse rounded bg-ink/10 md:w-96" />
      </div>
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-7 w-16 animate-pulse rounded bg-ink/10" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="space-y-px rounded-xl border border-line">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-3">
              <div className="h-4 w-4 animate-pulse rounded bg-ink/10" />
              <div className="h-4 flex-1 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 h-7 w-20 animate-pulse rounded bg-ink/10" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-ink/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
