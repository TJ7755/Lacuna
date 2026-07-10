import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useAllCards, useDecks } from '../../state/useData';
import { useCourses, useAllLessons, useAllNotes } from '../../state/useCourseData';
import {
  cardEditPath,
  plainPreview,
  searchCards,
  searchCourseContent,
  type CourseContentHit,
  type SearchResult,
} from '../../db/search';
import { SearchIcon, GridIcon, FolderIcon, FileTextIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';

/** A single, ordered list mixing course/lesson/note hits ahead of card hits. */
type PaletteHit = ({ kind: 'card' } & SearchResult) | CourseContentHit;

/** Where a palette hit deep-links to. */
function hitPath(hit: PaletteHit): string {
  switch (hit.kind) {
    case 'card':
      return cardEditPath(hit.card);
    case 'course':
      return `/course/${hit.course.id}`;
    case 'lesson':
    case 'note':
      return `/course/${hit.course.id}/lesson/${hit.lesson.id}`;
  }
}

/** Icon and label for a course/lesson/note hit row. */
function courseHitMeta(hit: CourseContentHit) {
  switch (hit.kind) {
    case 'course':
      return { icon: GridIcon, title: hit.course.name, subtitle: 'Course' };
    case 'lesson':
      return { icon: FolderIcon, title: hit.lesson.name, subtitle: hit.course.name };
    case 'note':
      return {
        icon: FileTextIcon,
        title: hit.note.name,
        subtitle: `${hit.course.name} · ${hit.lesson.name}`,
      };
  }
}

const MAX_RESULTS = 40;

/** Highlight every substring in `text` that matches `query` (case-insensitive). */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="rounded bg-accent/15 px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A keyboard-summoned (Ctrl/Cmd+K) overlay for searching every card. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const decks = useDecks();
  const cards = useAllCards();
  const courses = useCourses();
  const lessons = useAllLessons();
  const notes = useAllNotes();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [active, setActive] = useState(0);

  // Debounce the search query so expensive full-text search does not run on
  // every keystroke. 150ms keeps the UI feeling responsive while avoiding
  // redundant work during rapid typing.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Course/lesson/note hits are listed ahead of card hits, then both are capped
  // together so the palette never grows unbounded on a broad query.
  const results = useMemo((): PaletteHit[] => {
    const courseHits = searchCourseContent(
      debouncedQuery,
      courses ?? [],
      lessons ?? [],
      notes ?? [],
    );
    const cardHits = searchCards(debouncedQuery, cards ?? [], decks ?? []).map(
      (r): PaletteHit => ({ kind: 'card', ...r }),
    );
    return [...courseHits, ...cardHits].slice(0, MAX_RESULTS);
  }, [debouncedQuery, cards, decks, courses, lessons, notes]);

  // Reset and focus whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(results.length > 0 ? 0 : -1), [results.length, query]);

  function go(index: number) {
    const hit = results[index];
    if (!hit) return;
    onClose();
    navigate(hitPath(hit));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length > 0 ? Math.min(a + 1, results.length - 1) : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length > 0 ? Math.max(a - 1, 0) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(active);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/20 will-change-transform-opacity"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <SearchIcon width={18} height={18} className="text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses, lessons, notes and cards…"
                className="flex-1 bg-transparent text-sm text-ink outline-none focus-visible:shadow-none placeholder:text-ink-faint"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
                Esc
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              <AnimatePresence mode="wait">
                {query.trim() === '' ? (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 * m }}
                    className="px-4 py-6 text-center text-sm text-ink-faint"
                  >
                    Type to search across every course.
                  </motion.p>
                ) : results.length === 0 ? (
                  <motion.p
                    key="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 * m }}
                    className="px-4 py-6 text-center text-sm text-ink-faint"
                  >
                    Nothing matches &ldquo;{debouncedQuery}&rdquo;.
                  </motion.p>
                ) : (
                  <motion.ul
                    key="results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 * m }}
                    className="py-1"
                  >
                    {results.map((hit, i) => {
                      const key =
                        hit.kind === 'card'
                          ? hit.card.id
                          : hit.kind === 'course'
                            ? hit.course.id
                            : hit.kind === 'lesson'
                              ? hit.lesson.id
                              : hit.note.id;
                      return (
                        <motion.li
                          key={`${hit.kind}-${key}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.12 * m, delay: Math.min(i * 0.015, 0.15) * m }}
                        >
                          <button
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => go(i)}
                            className={
                              'flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-all duration-150 ' +
                              (i === active ? 'bg-accent-soft' : 'hover:bg-ink/5')
                            }
                          >
                            {hit.kind === 'card' ? (
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-sm text-ink">
                                  <HighlightedText
                                    text={plainPreview(hit.card.front, 90) || '(empty front)'}
                                    query={query}
                                  />
                                </span>
                                <span className="flex items-center gap-2 text-xs text-ink-faint">
                                  <span className="truncate">{hit.deck.name}</span>
                                  {(hit.card.tags ?? []).length > 0 && (
                                    <span className="truncate">
                                      · {hit.card.tags!.join(', ')}
                                    </span>
                                  )}
                                </span>
                              </span>
                            ) : (
                              (() => {
                                const { icon: HitIcon, title, subtitle } = courseHitMeta(hit);
                                return (
                                  <>
                                    <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-accent-soft text-accent">
                                      <HitIcon width={14} height={14} />
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                      <span className="truncate text-sm text-ink">
                                        <HighlightedText text={title} query={query} />
                                      </span>
                                      <span className="truncate text-xs text-ink-faint">
                                        {subtitle}
                                      </span>
                                    </span>
                                  </>
                                );
                              })()
                            )}
                          </button>
                        </motion.li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* Footer shortcuts */}
            <div className="flex items-center gap-3 border-t border-line bg-surface-raised/30 px-4 py-2 text-[10px] text-ink-faint">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line px-1 py-0.5">↑</kbd>
                <kbd className="rounded border border-line px-1 py-0.5">↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line px-1 py-0.5">↵</kbd>
                Open
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
