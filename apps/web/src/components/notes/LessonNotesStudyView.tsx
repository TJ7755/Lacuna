// Read-only notes view for study sessions. Note bodies stay mounted so opening
// never reparses Markdown, rebuilds diagrams or loses an annotation draft.

import { memo, useMemo, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { AnnotatedNoteContent } from './AnnotatedNoteContent';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../ui/icons';
import { SECTION_CARD_SURFACE_CLASS } from '../ui/SectionCard';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Note } from '@lacuna/core/db/types';

interface LessonNotesStudyViewProps {
  notes: Note[];
  className?: string;
}

export function LessonNotesStudyView({ notes, className }: LessonNotesStudyViewProps) {
  const sortedNotes = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <section className={className}>
      <h2 className="mb-4 font-display text-xl text-ink">Notes</h2>
      {sortedNotes.length > 0 ? (
        <div
          className={`${SECTION_CARD_SURFACE_CLASS} flex flex-col divide-y divide-line overflow-hidden`}
        >
          {sortedNotes.map((note) => (
            <StudyNoteSection key={note.id} note={note} />
          ))}
        </div>
      ) : (
        <div className={`${SECTION_CARD_SURFACE_CLASS} py-12 text-center`}>
          <p className="text-sm text-ink-soft">No notes yet.</p>
        </div>
      )}
    </section>
  );
}

const StudyNoteSection = memo(function StudyNoteSection({ note }: { note: Note }) {
  const [open, setOpen] = useState(true);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const pressed = useRef(false);
  const content = useMemo(() => <AnnotatedNoteContent note={note} />, [note]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onPointerDown={(event) => {
          pressed.current = false;
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          pressed.current = true;
          setOpen((value) => !value);
        }}
        onPointerCancel={() => {
          pressed.current = false;
        }}
        onClick={(event) => {
          // Mouse presses start immediately; keyboard and touch retain native click activation.
          if (!pressed.current || event.detail === 0) setOpen((value) => !value);
          pressed.current = false;
        }}
        className="flex min-h-14 w-full items-center gap-2.5 px-6 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink"
      >
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.15 * multiplier }}
          className="shrink-0 text-ink-faint"
        >
          <ChevronDownIcon width={14} height={14} />
        </motion.span>
        <span className="flex-1 font-medium text-ink">{note.name}</span>
      </button>
      <AnimatedDisclosure
        open={open}
        retainContent
        innerClassName="border-t border-line px-6 pb-5 pt-4"
      >
        {content}
      </AnimatedDisclosure>
    </div>
  );
});
