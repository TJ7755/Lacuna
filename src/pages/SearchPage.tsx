import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useSearchData } from '../state/useSearchData';
import {
  searchCardsInScope,
  searchCourseContent,
  searchQuestionsInScope,
  type CardFilter,
} from '../db/search';
import { cn } from '../components/ui/cn';
import { SearchIcon, CardsIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { Skeleton } from '../components/ui/Skeleton';
import { SECTION_CARD_SURFACE_CLASS } from '../components/ui/SectionCard';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { SearchResultContent } from '../components/search/SearchResultContent';
import { hitKey, hitPath } from '../components/search/searchPresentation';

/** The structured filters offered as quick chips, in display order. */
const FILTER_CHIPS: { value: CardFilter; label: string }[] = [
  { value: 'due', label: 'Due now' },
  { value: 'new', label: 'New' },
  { value: 'leech', label: 'Leeches' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'suspended', label: 'Suspended' },
];
const PAGE_SIZE = 80;

/** Full-page content search with Card filters. Quick search remains the shortcut-led overlay. */
export function SearchPage() {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const searchData = useSearchData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const deferredQuery = useDeferredValue(query);
  const filterKey = params.getAll('filter').sort().join(',');
  const filters = useMemo(
    () =>
      new Set(
        FILTER_CHIPS.flatMap(({ value }) => (filterKey.split(',').includes(value) ? [value] : [])),
      ),
    [filterKey],
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const shown = Number(params.get('shown'));
  const selectionChanged = useRef(false);
  const criteria = `${deferredQuery}:${[...filters].join(',')}`;

  const results = useMemo(() => {
    const scope = {
      cards: searchData?.cards ?? [],
      courses: searchData?.courses ?? [],
      lessons: searchData?.lessons ?? [],
    };
    // Structured filters narrow only Cards; a text query still matches other content.
    return [
      ...searchCourseContent(deferredQuery, scope.courses, scope.lessons, searchData?.notes ?? []),
      ...searchQuestionsInScope(deferredQuery, {
        ...scope,
        questions: searchData?.questions ?? [],
      }),
      ...searchCardsInScope(deferredQuery, scope, { filters: [...filters] }),
    ];
  }, [deferredQuery, searchData, filters]);
  const limit =
    Number.isFinite(shown) && shown > PAGE_SIZE
      ? Math.min(Math.floor(shown), Math.max(PAGE_SIZE, results.length))
      : PAGE_SIZE;
  const visible = results.slice(0, limit);
  const searching = query.trim() !== '' || filters.size > 0;
  const hasResults = searching && visible.length > 0;

  useEffect(() => {
    searchInput.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    setActive(0);
  }, [criteria]);
  useEffect(() => {
    // Returning restores the shell's scroll position; only an explicit arrow moves it.
    if (!selectionChanged.current) return;
    const option = resultList.current?.querySelector<HTMLElement>(`#search-option-${active}`);
    // Arrowing past the shown rows extends the URL's limit, which renders a little later;
    // keep the request until that row exists.
    if (!option) return;
    option.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    selectionChanged.current = false;
  }, [active, limit]);

  function updateParams(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    change(next);
    setParams(next, { replace: true });
  }
  function setLimit(value: number) {
    updateParams((next) => next.set('shown', String(value)));
  }
  function toggleFilter(value: CardFilter) {
    updateParams((next) => {
      next.delete('shown');
      const values = new Set(filters);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      next.delete('filter');
      values.forEach((filter) => next.append('filter', filter));
    });
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    if (event.key === 'Escape') {
      searchInput.current?.focus();
      searchInput.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return;
    }
    if (event.target !== searchInput.current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasResults) return;
      const next = Math.max(
        0,
        Math.min(active + (event.key === 'ArrowDown' ? 1 : -1), results.length - 1),
      );
      if (next >= limit) setLimit(limit + PAGE_SIZE);
      selectionChanged.current = true;
      setActive(next);
    } else if (event.key === 'Enter' && hasResults && query === deferredQuery) {
      event.preventDefault();
      const hit = visible[active];
      if (hit) void navigate(hitPath(hit));
    }
  }

  return (
    <div className={`${PAGE_FRAME} py-10 [&>*]:max-w-3xl`} onKeyDown={onKeyDown}>
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Search content
        </h1>
      </header>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 card-surface card-surface-control transition-colors focus-within:border-accent-ink">
        <SearchIcon width={18} height={18} className="text-ink-faint" />
        <input
          ref={searchInput}
          role="combobox"
          aria-label="Search content"
          aria-autocomplete="list"
          aria-expanded={hasResults}
          aria-controls={hasResults ? 'search-listbox' : undefined}
          aria-activedescendant={
            hasResults && active < visible.length ? `search-option-${active}` : undefined
          }
          value={query}
          onChange={(event) =>
            updateParams((next) => {
              next.delete('shown');
              if (event.target.value) next.set('q', event.target.value);
              else next.delete('q');
            })
          }
          placeholder="Search courses, lessons, notes, cards and questions…"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none focus-visible:shadow-none placeholder:text-ink-faint"
        />
      </div>
      {/* Smart-view filter chips: narrow the whole collection without a text query. */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {FILTER_CHIPS.map((chip, i) => {
          const on = filters.has(chip.value);
          return (
            <motion.button
              key={chip.value}
              type="button"
              onClick={() => toggleFilter(chip.value)}
              aria-pressed={on}
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.14 * m, delay: i * 0.02 * m }}
              whileHover={m > 0 ? { y: -1, transition: { duration: 0.1 * m } } : undefined}
              data-press=""
              whileTap={m > 0 ? { scale: 0.97 } : undefined}
              className={cn(
                'min-h-11 rounded-full border px-3 py-1 text-sm transition-colors',
                on
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {chip.label}
            </motion.button>
          );
        })}
        {filters.size > 0 && (
          <motion.button
            type="button"
            onClick={() => {
              updateParams((next) => {
                next.delete('filter');
                next.delete('shown');
              });
              searchInput.current?.focus();
            }}
            initial={m > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14 * m }}
            className="min-h-11 rounded-full px-3 py-1 text-sm text-ink-faint transition-colors hover:text-ink"
          >
            Clear
          </motion.button>
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn('mb-3 text-sm text-ink-soft', (!searching || !searchData) && 'sr-only')}
      >
        {!searchData || !searching
          ? ''
          : results.length === 0
            ? 'No results'
            : `${visible.length < results.length ? `${visible.length} of ` : ''}${results.length} ${results.length === 1 ? 'result' : 'results'}`}
      </p>
      {!searchData ? (
        <DelayedFallback>
          <SearchSkeleton />
        </DelayedFallback>
      ) : !searching ? null : results.length === 0 ? (
        <div
          className={`${SECTION_CARD_SURFACE_CLASS} flex flex-col items-center justify-center py-16 text-center`}
        >
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink shadow-sm">
            <CardsIcon width={24} height={24} />
          </div>
          <h2 className="font-display text-xl">Nothing matches</h2>
        </div>
      ) : (
        <>
          <div
            ref={resultList}
            id="search-listbox"
            role="listbox"
            aria-label="Search results"
            className="grid gap-2"
          >
            {visible.map((hit, index) => (
              <motion.button
                key={hitKey(hit)}
                id={`search-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                initial={m > 0 ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.16 * m }}
                onClick={() => void navigate(hitPath(hit))}
                onFocus={() => setActive(index)}
                whileHover={m > 0 ? { y: -3, transition: { duration: 0.12 * m } } : undefined}
                className={cn(
                  SECTION_CARD_SURFACE_CLASS,
                  'flex min-h-11 min-w-0 items-center gap-3 p-4 text-left card-surface-control transition-colors hover:bg-surface-raised',
                  index === active && 'ring-2 ring-accent-ink',
                )}
              >
                <SearchResultContent hit={hit} query={deferredQuery} />
              </motion.button>
            ))}
          </div>
          {visible.length < results.length && (
            <button
              type="button"
              onClick={() => setLimit(limit + PAGE_SIZE)}
              className="mt-4 min-h-11 rounded-full px-4 text-sm text-accent-ink"
            >
              Show more results
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={`${SECTION_CARD_SURFACE_CLASS} flex flex-col gap-1 p-4`}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-1 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
