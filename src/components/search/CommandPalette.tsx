import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useSearchData } from '../../state/useSearchData';
import {
  cardEditPath,
  plainPreview,
  questionEditPath,
  searchCardsInScope,
  searchCourseContent,
  searchQuestionsInScope,
  type CourseContentHit,
  type ScopedSearchResult,
} from '../../db/search';
import { SearchIcon, GridIcon, FolderIcon, FileTextIcon } from '../ui/icons';
import { GeneratedCardBadge } from '../cards/GeneratedCardBadge';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useFocusTrap } from '../../hooks/useFocusTrap';

/** A single ordered list of navigation, Card and Question hits. */
type PaletteHit = ScopedSearchResult | CourseContentHit;

/** Where a palette hit deep-links to. */
function hitPath(hit: PaletteHit): string {
  switch (hit.kind) {
    case 'card':
      return cardEditPath(hit.card);
    case 'question':
      return questionEditPath(hit.question);
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

/** Quick search: a keyboard-summoned overlay for jumping straight to content. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CommandPaletteDialog onClose={onClose} />;
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const searchData = useSearchData();
  const cards = searchData?.cards;
  const courses = searchData?.courses;
  const lessons = searchData?.lessons;
  const notes = searchData?.notes;
  const questions = searchData?.questions;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const trapRef = useFocusTrap(true, { autoFocusSelector: 'input', returnFocus: false });

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);

  // Course/lesson/note hits are listed ahead of card hits, then both are capped
  // together so the palette never grows unbounded on a broad query. Deferring
  // the search keeps input updates urgent without imposing a fixed delay.
  const results = useMemo((): PaletteHit[] => {
    const courseHits = searchCourseContent(
      deferredQuery,
      courses ?? [],
      lessons ?? [],
      notes ?? [],
    );
    const cardHits = searchCardsInScope(deferredQuery, {
      cards: cards ?? [],
      courses: courses ?? [],
      lessons: lessons ?? [],
    });
    const questionHits = searchQuestionsInScope(deferredQuery, {
      questions: questions ?? [],
      courses: courses ?? [],
      lessons: lessons ?? [],
    });
    return [...courseHits, ...questionHits, ...cardHits].slice(0, MAX_RESULTS);
  }, [deferredQuery, cards, courses, lessons, notes, questions]);
  const hasVisibleResults = query.trim() !== '' && results.length > 0;

  // Reset and focus when the palette mounts.
  useEffect(() => {
    setQuery('');
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // AppShell removes `inert` from the page after this dialog unmounts. Return
  // focus on the next frame so the browser can accept focus on the trigger.
  useEffect(
    () => () => {
      const trigger = returnFocusRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    },
    [],
  );

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
      {
        <motion.div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Quick search"
          className="fixed inset-0 z-50 flex items-start justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(12vh,env(safe-area-inset-top))]"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
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
                role="combobox"
                aria-controls="palette-listbox"
                aria-expanded={hasVisibleResults}
                aria-autocomplete="list"
                aria-activedescendant={
                  hasVisibleResults && active >= 0 ? `palette-option-${active}` : undefined
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses, lessons, notes, cards and questions…"
                className="flex-1 bg-transparent text-sm text-ink outline-none focus-visible:shadow-none placeholder:text-ink-faint"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
                Esc
              </kbd>
            </div>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {query.trim() === ''
                ? 'Type to search'
                : results.length === 0
                  ? `No results for ${deferredQuery}`
                  : `${results.length} ${results.length === 1 ? 'result' : 'results'} available`}
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
                    Nothing matches &ldquo;{deferredQuery}&rdquo;.
                  </motion.p>
                ) : (
                  <motion.ul
                    key="results"
                    id="palette-listbox"
                    role="listbox"
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
                          : hit.kind === 'question'
                            ? hit.question.id
                            : hit.kind === 'course'
                              ? hit.course.id
                              : hit.kind === 'lesson'
                                ? hit.lesson.id
                                : hit.note.id;
                      return (
                        <motion.li
                          key={`${hit.kind}-${key}`}
                          role="presentation"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.12 * m, delay: Math.min(i * 0.015, 0.15) * m }}
                        >
                          <button
                            type="button"
                            role="option"
                            id={`palette-option-${i}`}
                            aria-selected={i === active}
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
                                  <span className="truncate">{hit.contextName}</span>
                                  {(hit.card.tags ?? []).length > 0 && (
                                    <span className="truncate">· {hit.card.tags!.join(', ')}</span>
                                  )}
                                  {hit.card.sequenceItemId !== null &&
                                    hit.card.sequenceItemId !== undefined && (
                                      <GeneratedCardBadge kind="sequence" />
                                    )}
                                  {hit.card.occlusionRegionId !== null &&
                                    hit.card.occlusionRegionId !== undefined && (
                                      <GeneratedCardBadge kind="occlusion" />
                                    )}
                                </span>
                              </span>
                            ) : hit.kind === 'question' ? (
                              <>
                                <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-accent-soft text-accent">
                                  <FileTextIcon width={14} height={14} />
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="truncate text-sm text-ink">
                                    <HighlightedText
                                      text={
                                        hit.question.kind === 'fixed'
                                          ? plainPreview(hit.question.prompt, 90) ||
                                            hit.question.name
                                          : hit.question.name
                                      }
                                      query={query}
                                    />
                                  </span>
                                  <span className="flex items-center gap-2 text-xs text-ink-faint">
                                    <span className="truncate">{hit.contextName}</span>
                                    <span>· Question</span>
                                    {hit.question.kind === 'generated' && (
                                      <span>· Generated family</span>
                                    )}
                                  </span>
                                </span>
                              </>
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
      }
    </AnimatePresence>
  );
}
