// Notes CRUD section for LessonView — collapsible note list with add/edit/
// delete/reorder, using NoteRow for each entry. Self-contained: owns its own
// add/edit/delete/expand state so LessonView only needs to pass the lesson id
// and its live notes query. Extracted from LessonView.tsx to keep the page
// component focused on layout and to demote editing behind its own section
// (see LessonView.tsx — study is the primary action, notes/cards are the
// secondary "editor" half of the page).

import { useState } from 'react';
import { m as motion } from 'motion/react';
import { NoteRow } from './NoteRow';
import { LessonNoteEditor } from './LessonNoteEditor';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import { createNote, updateNote, deleteNote, reorderNotes } from '../../db/repository';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Note } from '../../db/types';

interface LessonNotesSectionProps {
  lessonId: string;
  notes: Note[];
  className?: string;
}

export function LessonNotesSection({ lessonId, notes, className }: LessonNotesSectionProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const [addingNote, setAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  // Per-note deletion confirm state; holds the id of the note awaiting confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Note expand/collapse state — mirrors the LessonNotes collapsible pattern.
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(() => new Set());

  const sortedNotes = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);

  async function handleAddNote(data: { name: string; content: string }) {
    setNoteBusy(true);
    try {
      await createNote(lessonId, data.name, data.content);
      setAddingNote(false);
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
    await deleteNote(noteId);
  }

  async function handleMoveNote(noteId: string, direction: 'up' | 'down') {
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
    <section className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl text-ink-soft">Notes</h2>
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
            <LessonNoteEditor onSave={handleAddNote} onCancel={() => setAddingNote(false)} busy={noteBusy} />
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
  );
}
