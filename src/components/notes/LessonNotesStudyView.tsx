// Read-only notes view for LessonView's study mode — same collapsible-list
// shape as LessonNotesSection but with no add/edit/delete/reorder controls,
// reusing MarkdownView for each note's body exactly as NoteRow does. Kept
// separate from LessonNotesSection rather than bolting a read-only flag onto
// its CRUD rows, since the two have almost no shared behaviour once editing
// is removed.

import { useState } from 'react';
import { m as motion } from 'motion/react';
import { AnnotatedNoteContent } from './AnnotatedNoteContent';
import { ChevronDownIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Note } from '../../db/types';

interface LessonNotesStudyViewProps {
  notes: Note[];
  className?: string;
}

export function LessonNotesStudyView({ notes, className }: LessonNotesStudyViewProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Notes open by default in study mode — there is nothing to edit, so the
  // collapsible chrome exists purely to let a long note list be scanned.
  const sortedNotes = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(
    () => new Set(sortedNotes.map((n) => n.id)),
  );

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
      <h2 className="mb-4 font-display text-xl text-ink-soft">Notes</h2>

      {sortedNotes.length > 0 ? (
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {sortedNotes.map((note) => {
            const isOpen = openNoteIds.has(note.id);
            return (
              <div key={note.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleNoteOpen(note.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
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
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.12 * m }}
                    className="border-t border-line px-5 py-4"
                  >
                    <AnnotatedNoteContent note={note} />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong py-12 text-center">
          <p className="text-sm text-ink-soft">No notes yet.</p>
        </div>
      )}
    </section>
  );
}
