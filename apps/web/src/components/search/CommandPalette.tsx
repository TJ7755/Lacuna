import { ModalBackdrop } from '../ui/ModalBackdrop';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AppLink as Link } from '../ui/AppLink';
import { AnimatePresence, m as motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import { useSearchData } from '../../state/useSearchData';
import { searchCardsInScope } from '@lacuna/core/db/search';
import { globalSearch } from './globalSearch';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';
import { SearchIcon } from '../ui/icons';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { StudyDrawing } from '../ui/StudyDrawing';
import { SearchCardPreview, type CardSearchHit } from './SearchCardPreview';
import { SearchResultOption } from './SearchResultOption';
import { hitKey, hitPath, type SearchHit } from './searchPresentation';

/** A single ordered list of Help, navigation, Card and Question hits. */
type PaletteHit = SearchHit;

function PaletteResults(props: HTMLMotionProps<'ul'>) {
  const present = useIsPresent();
  return <motion.ul {...props} inert={!present} aria-hidden={!present || undefined} />;
}

const MAX_RESULTS = 40;

/** Quick search: a keyboard-summoned overlay for jumping straight to content. */
export function CommandPalette({
  open,
  onClose,
  returnFocusTarget,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTarget?: RefObject<HTMLElement | null>;
}) {
  if (!open) return null;
  return <GlobalPaletteDialog onClose={onClose} returnFocusTarget={returnFocusTarget} />;
}

function GlobalPaletteDialog({
  onClose,
  returnFocusTarget,
}: {
  onClose: () => void;
  returnFocusTarget?: RefObject<HTMLElement | null>;
}) {
  const searchData = useSearchData();
  const search = useCallback((query: string) => globalSearch(query, searchData), [searchData]);
  return (
    <CommandPaletteDialog
      onClose={onClose}
      returnFocusTarget={returnFocusTarget}
      label="Quick search"
      inputLabel="Search all content"
      placeholder="Search…"
      search={search}
      limit={MAX_RESULTS}
    />
  );
}

/**
 * Quick search narrowed to one lesson's cards, primary and linked, for Ctrl/Cmd+F on a
 * lesson. Portalled, as page-owned dialogs are, so the page's transforms cannot clip it.
 */
export function LessonCardsPalette({
  cards,
  course,
  lesson,
  navigationState,
  onClose,
  returnFocusTarget,
}: {
  cards: Card[];
  course: Course;
  lesson: Lesson;
  /** Router state for an opened card, so its editor returns to the lesson. */
  navigationState?: unknown;
  onClose: () => void;
  returnFocusTarget?: RefObject<HTMLElement | null>;
}) {
  const search = useCallback(
    (query: string) =>
      searchCardsInScope(
        query,
        { cards, courses: [course], lessons: [lesson] },
        { parseQuery: true },
      ),
    [cards, course, lesson],
  );
  return createPortal(
    <CommandPaletteDialog
      onClose={onClose}
      returnFocusTarget={returnFocusTarget}
      label="Find cards"
      inputLabel="Find cards in this lesson"
      placeholder="Find cards in this lesson…"
      search={search}
      navigationState={navigationState}
      scoped
    />,
    document.body,
  );
}

function CommandPaletteDialog({
  onClose,
  returnFocusTarget,
  label,
  inputLabel,
  placeholder,
  search,
  limit,
  navigationState,
  scoped = false,
}: {
  onClose: () => void;
  returnFocusTarget?: RefObject<HTMLElement | null>;
  label: string;
  inputLabel: string;
  placeholder: string;
  search: (query: string) => PaletteHit[];
  /** Caps the list and offers the full results page beyond it. */
  limit?: number;
  navigationState?: unknown;
  /** Ctrl/Cmd+F reselects the field; Ctrl/Cmd+K hands over to Quick search. */
  scoped?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    returnFocusTarget?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );
  const [preview, setPreview] = useState<CardSearchHit | null>(null);
  const searchPanel = useRef<HTMLDivElement>(null);
  const previewPanel = useRef<HTMLDivElement>(null);
  useFocusTrap(
    true,
    { autoFocusSelector: preview ? '[aria-pressed="true"]' : 'input', returnFocus: false },
    preview ? previewPanel : searchPanel,
  );

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [active, setActive] = useState(0);

  // Deferring the search keeps input updates urgent without imposing a fixed delay.
  const allResults = useMemo(() => search(deferredQuery), [search, deferredQuery]);
  const results = limit === undefined ? allResults : allResults.slice(0, limit);
  const hasVisibleResults = query.trim() !== '' && results.length > 0;
  const resultList = useRef<HTMLUListElement>(null);
  const selectionChanged = useRef(false);
  useEffect(() => {
    if (!selectionChanged.current) return;
    resultList.current
      ?.querySelector<HTMLElement>(`#palette-option-${active}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    selectionChanged.current = false;
  }, [active]);

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

  useEffect(() => setActive(results.length > 0 ? 0 : -1), [results.length, query, deferredQuery]);

  function closeForNavigation() {
    // The destination owns focus; dismissal alone returns it to the opener.
    returnFocusRef.current = null;
    onClose();
  }

  function go(index: number, edit = false) {
    const hit = results[index];
    if (!hit) return;
    if (hit.kind === 'card' && !scoped && !edit) {
      setPreview(hit);
      return;
    }
    closeForNavigation();
    void navigate(
      hitPath(hit),
      navigationState === undefined ? undefined : { state: navigationState },
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.defaultPrevented || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'Escape') {
      // Dismissal belongs to the dialog, not to the page beneath it.
      e.stopPropagation();
      if (preview) setPreview(null);
      else onClose();
    } else if (scoped && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        inputRef.current?.select();
      } else if (key === 'k') {
        // AppShell's Quick search takes over and returns focus to this dialog's opener.
        returnFocusRef.current?.focus();
        returnFocusRef.current = null;
        onClose();
      }
    } else if (e.target !== inputRef.current) {
      return;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectionChanged.current = true;
      setActive((a) => (results.length > 0 ? Math.min(a + 1, results.length - 1) : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectionChanged.current = true;
      setActive((a) => (results.length > 0 ? Math.max(a - 1, 0) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hasVisibleResults && query === deferredQuery) go(active, e.shiftKey);
    }
  }

  return (
    <AnimatePresence>
      {
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={preview ? 'Card preview' : label}
          className="fixed inset-0 z-50 flex items-start justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(12vh,env(safe-area-inset-top))]"
        >
          <ModalBackdrop shade={40} onClick={() => (preview ? setPreview(null) : onClose())} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-surface card-surface will-change-transform-opacity"
            onKeyDown={onKeyDown}
          >
            {preview && (
              <div ref={previewPanel} className="flex min-h-0 flex-col">
                <SearchCardPreview
                  key={preview.card.id}
                  hit={preview}
                  onClose={() => setPreview(null)}
                  onNavigate={closeForNavigation}
                />
              </div>
            )}
            <div ref={searchPanel} hidden={!!preview} inert={!!preview}>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <SearchIcon width={18} height={18} className="text-ink-faint" />
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-label={inputLabel}
                  aria-controls={hasVisibleResults ? 'palette-listbox' : undefined}
                  aria-expanded={hasVisibleResults}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    hasVisibleResults && active >= 0 && active < results.length
                      ? `palette-option-${active}`
                      : undefined
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
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
                    : `${results.length < allResults.length ? `${results.length} of ` : ''}${allResults.length} ${allResults.length === 1 ? 'result' : 'results'} available`}
              </div>

              <div className="max-h-[50vh] overflow-y-auto">
                <AnimatePresence mode="wait">
                  {query.trim() === '' ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 * m }}
                      className="flex justify-center px-4 py-5"
                    >
                      <StudyDrawing kind="search" className="h-14 w-14 opacity-60" />
                    </motion.div>
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
                    <PaletteResults
                      ref={resultList}
                      key="results"
                      id="palette-listbox"
                      role="listbox"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 * m }}
                      // Inset rounded rows, as in every other menu; 6px + 10px keeps the
                      // text on the search field's 16px edge.
                      className="p-1.5"
                    >
                      {results.map((hit, i) => {
                        return (
                          <li key={hitKey(hit)} role="presentation">
                            <SearchResultOption
                              index={i}
                              hit={hit}
                              query={deferredQuery}
                              id={`palette-option-${i}`}
                              selected={i === active}
                              onSelect={() => setActive(i)}
                              onOpen={() => go(i)}
                            />
                          </li>
                        );
                      })}
                    </PaletteResults>
                  )}
                </AnimatePresence>
              </div>

              {hasVisibleResults && limit !== undefined && allResults.length > limit && (
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-ink-faint">
                  <span>
                    {results.length} of {allResults.length} results
                  </span>
                  <Link
                    to={`/search?${new URLSearchParams({ q: query })}`}
                    onClick={closeForNavigation}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-accent-ink"
                  >
                    See all results
                  </Link>
                </div>
              )}

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
            </div>
          </motion.div>
        </motion.div>
      }
    </AnimatePresence>
  );
}
