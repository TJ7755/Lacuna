// The lesson's notes as one large reading card. Several notes become underlined
// text tabs; a single note shows its name as the heading instead. In View mode
// the card is read-only; in Edit mode the same card gains add, edit, delete and
// reorder controls that fade in without moving the text (the action row keeps its
// height in both modes). Replaces the old collapsible NoteRow list.

import { useState, type ComponentProps } from 'react';
import { AnimatePresence, LayoutGroup, m as motion, useIsPresent } from 'motion/react';
import { AnnotatedNoteContent } from './AnnotatedNoteContent';
import { LessonNoteEditor } from './LessonNoteEditor';
import { Button } from '../ui/Button';
import { ConfirmInlineSwap } from '../ui/ConfirmInline';
import { ChevronDownIcon, EditIcon, PlusIcon, TrashIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { collapse, motionTransition, scaledSpring } from '../ui/motion';
import { createNote, updateNote, deleteNote, reorderNotes } from '../../db/noteRepository';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Note } from '../../db/types';

interface LessonNotesCardProps {
  lessonId: string;
  notes: Note[];
  /** Edit mode: shows the add, edit, delete and reorder controls. */
  editable: boolean;
  className?: string;
}

const ICON_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-30';

export function LessonNotesCard({
  lessonId,
  notes,
  editable,
  className,
}: LessonNotesCardProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedNotes = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);
  // A deleted or not-yet-chosen selection falls back to the first note.
  const activeNote = sortedNotes.find((n) => n.id === selectedId) ?? sortedNotes[0];
  const activeIndex = activeNote ? sortedNotes.indexOf(activeNote) : -1;
  const editingActive = activeNote !== undefined && editingNoteId === activeNote.id;

  async function handleAddNote(data: { name: string; content: string }) {
    setNoteBusy(true);
    try {
      const created = await createNote(lessonId, data.name, data.content);
      setAddingNote(false);
      setSelectedId(created.id);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleEditNote(noteId: string, data: { name: string; content: string }) {
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
    setSelectedId(null);
    await deleteNote(noteId);
  }

  async function handleMoveNote(direction: 'up' | 'down') {
    if (!activeNote) return;
    const swapIdx = direction === 'up' ? activeIndex - 1 : activeIndex + 1;
    if (swapIdx < 0 || swapIdx >= sortedNotes.length) return;
    const ordered = sortedNotes.map((n) => n.id);
    [ordered[activeIndex], ordered[swapIdx]] = [ordered[swapIdx], ordered[activeIndex]];
    await reorderNotes(lessonId, ordered);
  }

  const showTabs = sortedNotes.length > 1;

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-5 rounded-3xl bg-surface p-6 text-[17px] leading-[1.65] shadow-card md:px-12 md:py-10',
        className,
      )}
    >
      {/* A single note in View mode needs neither tabs nor controls, so the row
          folds away rather than leaving an empty band above the text. */}
      <AnimatePresence initial={false}>
      {(showTabs || editable) && (
      <motion.div
        key="note-bar"
        {...collapse(m)}
        data-note-bar=""
        className="flex min-h-11 items-center justify-between gap-3 text-[15px] leading-normal"
      >
        {showTabs ? (
          <div role="tablist" aria-label="Notes" className="flex min-w-0 gap-5 overflow-x-auto">
            <LayoutGroup id={`note-tabs-${lessonId}`}>
              {sortedNotes.map((note) => {
                const active = note.id === activeNote?.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setSelectedId(note.id);
                      setConfirmDeleteId(null);
                    }}
                    className={cn(
                      'relative min-h-11 shrink-0 whitespace-nowrap py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      active ? 'font-bold text-ink' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    {note.name}
                    {active && (
                      <motion.span
                        layoutId="note-tab-underline"
                        aria-hidden="true"
                        transition={scaledSpring(m, 380, 32)}
                        className="absolute inset-x-0 bottom-1 h-0.5 rounded-full bg-ink"
                      />
                    )}
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        ) : sortedNotes.length === 0 ? (
          // Names the empty card, as its neighbour names the cards.
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Notes</h2>
        ) : (
          <span />
        )}

        <AnimatePresence initial={false}>
          {editable && !addingNote && !editingActive && (
            <NoteActionsBar
              key="note-actions"
              initial={m > 0 ? { opacity: 0, scale: 0.9 } : false}
              animate={{ opacity: 1, scale: 1 }}
              exit={m > 0 ? { opacity: 0, scale: 0.9 } : undefined}
              transition={motionTransition('feedback', m)}
              className="flex shrink-0 items-center gap-0.5"
            >
              {activeNote && (
                <ConfirmInlineSwap
                  active={confirmDeleteId === activeNote.id}
                  message="Delete?"
                  onConfirm={() => void handleDeleteNote(activeNote.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  swapClassName="shrink-0"
                >
                  <div className="flex items-center gap-0.5">
                    {showTabs && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleMoveNote('up')}
                          disabled={activeIndex <= 0}
                          title="Move up"
                          className={ICON_BUTTON}
                        >
                          <ChevronDownIcon width={14} height={14} className="rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMoveNote('down')}
                          disabled={activeIndex >= sortedNotes.length - 1}
                          title="Move down"
                          className={ICON_BUTTON}
                        >
                          <ChevronDownIcon width={14} height={14} className="-rotate-90" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(activeNote.id);
                        setAddingNote(false);
                      }}
                      title="Edit note"
                      className={cn(ICON_BUTTON, 'hover:text-accent-ink')}
                    >
                      <EditIcon width={15} height={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(activeNote.id)}
                      title="Delete note"
                      className={cn(ICON_BUTTON, 'hover:bg-negative/10 hover:text-negative')}
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  </div>
                </ConfirmInlineSwap>
              )}
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
            </NoteActionsBar>
          )}
        </AnimatePresence>
      </motion.div>
      )}
      </AnimatePresence>

      {addingNote && (
        <LessonNoteEditor
          onSave={handleAddNote}
          onCancel={() => setAddingNote(false)}
          busy={noteBusy}
        />
      )}

      {!addingNote &&
        (activeNote ? (
          <motion.div
            key={`${activeNote.id}-${editingActive ? 'edit' : 'read'}`}
            initial={m > 0 ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition('local', m, 'emphasised')}
            className="flex flex-col gap-5"
          >
            {editingActive ? (
              <LessonNoteEditor
                note={activeNote}
                onSave={(data) => handleEditNote(activeNote.id, data)}
                onCancel={() => setEditingNoteId(null)}
                busy={noteBusy}
              />
            ) : (
              <>
                {!showTabs && (
                  <h2 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
                    {activeNote.name}
                  </h2>
                )}
                <AnnotatedNoteContent note={activeNote} />
              </>
            )}
          </motion.div>
        ) : (
          <p className="py-4 text-sm text-ink-soft">No notes yet.</p>
        ))}
    </article>
  );
}

/** The note actions, which leave the keyboard and accessibility tree as they start to exit. */
function NoteActionsBar(props: ComponentProps<typeof motion.div>) {
  const present = useIsPresent();
  return <motion.div {...props} inert={!present} aria-hidden={!present || undefined} />;
}
