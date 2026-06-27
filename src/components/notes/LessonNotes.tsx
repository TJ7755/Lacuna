import { useState } from 'react';
import { m as motion } from 'motion/react';
import { MarkdownView } from '../markdown/MarkdownView';
import { ChevronDownIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Note } from '../../db/types';

interface LessonNotesProps {
  notes: Note[];
  className?: string;
}

/**
 * Read-only render of a lesson's notes, each displayed as a collapsible titled
 * section. Notes are ordered by `orderIndex`. The first note starts expanded.
 */
export function LessonNotes({ notes, className }: LessonNotesProps) {
  const sorted = [...notes].sort((a, b) => a.orderIndex - b.orderIndex);

  // Initialise with the first note open.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(sorted.length > 0 ? [sorted[0].id] : []),
  );

  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  if (sorted.length === 0) return null;

  function toggle(id: string) {
    setOpenIds((prev) => {
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
    <div className={cn('flex flex-col divide-y divide-line rounded-xl border border-line', className)}>
      {sorted.map((note) => {
        const isOpen = openIds.has(note.id);
        return (
          <div key={note.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(note.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
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
                className="border-t border-line px-4 py-4"
              >
                <MarkdownView source={note.content} allowEmbeds />
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}
