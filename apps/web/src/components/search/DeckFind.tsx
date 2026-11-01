import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { originFrom } from '../../utils/editorOrigin';
import type { Card, Course, Lesson } from '../../db/types';
import { useScopedFindShortcut } from '../../hooks/useScopedFindShortcut';
import { SearchIcon } from '../ui/icons';
import { LessonCardsPalette } from './CommandPalette';

/** The lesson's Find: Quick search scoped to its cards, opened here or with Ctrl/Cmd+F. */
export function DeckFind({
  cards,
  course,
  lesson,
}: {
  cards: Card[];
  course: Course;
  lesson: Lesson;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const location = useLocation();
  // Focus returns to whatever held it, or to the button when nothing did.
  const show = () => {
    const active = document.activeElement;
    returnFocus.current =
      active instanceof HTMLElement && active !== document.body ? active : trigger.current;
    setOpen(true);
  };
  // An empty lesson has nothing to find, so the browser keeps its own Find.
  useScopedFindShortcut(cards.length > 0 ? show : undefined);
  if (cards.length === 0) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Find cards"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+F Meta+F"
        title="Find cards (Ctrl+F or Command+F)"
        onClick={() => {
          // Safari does not focus a clicked button, so name it as the return target.
          returnFocus.current = trigger.current;
          setOpen(true);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <SearchIcon width={18} height={18} />
      </button>
      {open && (
        <LessonCardsPalette
          cards={cards}
          course={course}
          lesson={lesson}
          navigationState={originFrom(location, lesson.name)}
          onClose={() => setOpen(false)}
          returnFocusTarget={returnFocus}
        />
      )}
    </>
  );
}
