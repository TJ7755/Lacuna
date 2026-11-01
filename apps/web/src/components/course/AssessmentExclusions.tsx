import { useState } from 'react';
import type { Card, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import { plainFront } from '../cards/lessonCardRow';
import { inputFrameClassName } from '../ui/Field';
import { PathEditorPopoverContent } from './PathEditorPopover';

export function AssessmentExclusions({
  open,
  trigger,
  close,
  lessons,
  cards,
  links,
  excluded,
  onChange,
}: {
  open: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  lessons: Lesson[];
  cards: Card[];
  links: LessonCardLink[];
  excluded: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalised = query.trim().toLocaleLowerCase();
  const shown = new Set<string>();
  const groups = lessons
    .map((lesson) => ({
      lesson,
      cards: cards.filter((card) => {
        if (
          shown.has(card.id) ||
          !(
            card.primaryLessonId === lesson.id ||
            links.some((link) => link.cardId === card.id && link.lessonId === lesson.id)
          )
        )
          return false;
        shown.add(card.id);
        return (
          !normalised || `${plainFront(card)} ${card.back}`.toLocaleLowerCase().includes(normalised)
        );
      }),
    }))
    .filter((group) => group.cards.length);
  return (
    <PathEditorPopoverContent
      id="assessment-exclusions"
      label="Excluded cards"
      open={open}
      trigger={trigger}
      close={close}
      anchorKey={excluded.length ? 'sentence' : 'summary'}
    >
      <input
        type="search"
        aria-label="Search covered cards"
        placeholder="Search covered cards…"
        className={`mb-2 w-full text-sm ${inputFrameClassName}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div
        className="max-h-72 w-[min(400px,calc(100vw-64px))] overflow-y-auto overscroll-contain"
        style={{ scrollBehavior: 'smooth' }}
      >
        {groups.map(({ lesson, cards }) => (
          <section key={lesson.id} aria-label={lesson.name}>
            <h3 className="px-3 py-2 text-xs font-medium text-ink-faint">{lesson.name}</h3>
            {cards.map((card) => {
              const active = excluded.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={plainFront(card)}
                  className="path-editor-option gap-3"
                  onClick={() =>
                    onChange(
                      active ? excluded.filter((id) => id !== card.id) : [...excluded, card.id],
                    )
                  }
                >
                  <span
                    className={`min-w-0 flex-1 break-words ${active ? 'text-ink-faint line-through' : 'text-ink'}`}
                  >
                    {plainFront(card)}
                  </span>
                  {active && <span className="shrink-0 text-xs text-ink-faint">Excluded</span>}
                </button>
              );
            })}
          </section>
        ))}
        {!groups.length && <p className="px-3 py-2 text-sm text-ink-faint">No matching cards.</p>}
      </div>
    </PathEditorPopoverContent>
  );
}
