import { searchHelp } from './help/searchHelp';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useSearchData } from '../state/useSearchData';
import {
  searchCardsInScope,
  searchCourseContent,
  searchQuestionsInScope,
  type CardFilter,
} from '../db/search';
import { cn } from '../components/ui/cn';
import { SearchIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { Skeleton } from '../components/ui/Skeleton';
import { SECTION_CARD_SURFACE_CLASS } from '../components/ui/SectionCard';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { SearchResultOption } from '../components/search/SearchResultOption';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { hitKey, hitPath, type SearchHit } from '../components/search/searchPresentation';

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
  const navigationType = useNavigationType();
  // History restores scroll against these rows. A stale deferred query can insert
  // unrelated rows, then shift the restored viewport when they disappear.
  const searchQuery = navigationType === 'POP' ? query : deferredQuery;
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
  const criteria = `${searchQuery}:${[...filters].join(',')}`;

  const results = useMemo<SearchHit[]>(() => {
    const scope = {
      cards: searchData?.cards ?? [],
      courses: searchData?.courses ?? [],
      lessons: searchData?.lessons ?? [],
    };
    // Structured filters narrow only Cards; a text query still matches other content.
    return [
      ...(searchQuery.trim()
        ? searchHelp(searchQuery)
            .slice(0, 3)
            .map((topic): SearchHit => ({ kind: 'help', topic }))
        : []),
      ...searchCourseContent(searchQuery, scope.courses, scope.lessons, searchData?.notes ?? []),
      ...searchQuestionsInScope(searchQuery, {
        ...scope,
        questions: searchData?.questions ?? [],
      }),
      ...searchCardsInScope(searchQuery, scope, { filters: [...filters] }),
    ];
  }, [searchQuery, searchData, filters]);
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
    } else if (event.key === 'Enter' && hasResults && query === searchQuery) {
      event.preventDefault();
      const hit = visible[active];
      if (hit) void navigate(hitPath(hit));
    }
  }

  return (
    <div className={`${PAGE_FRAME} py-12 md:py-20`} onKeyDown={onKeyDown}>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-balance font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Search content
          </h1>
        </header>
        <div className="mb-4 flex items-center gap-3 rounded-full bg-surface px-5 py-2 card-surface card-surface-control transition-colors focus-within:ring-2 focus-within:ring-accent-ink sm:px-6 sm:py-3">
          <SearchIcon width={20} height={20} className="shrink-0 text-ink-faint" />
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
            placeholder="Search…"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none focus-visible:shadow-none placeholder:text-ink-faint"
          />
        </div>
        {/* Smart-view filter chips: narrow the whole collection without a text query. */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-1.5">
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
        </div>
        <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn('text-sm text-ink-soft', (!searching || !searchData) && 'sr-only')}
          >
            {!searchData || !searching
              ? ''
              : results.length === 0
                ? 'No results'
                : `${visible.length < results.length ? `${visible.length} of ` : ''}${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </p>
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
        <PageLoadingBoundary pending={!searchData} fallback={<SearchSkeleton />}>
          {!searchData ? null : !searching ? (
            <div className="flex justify-center py-8">
              <StudyDrawing kind="search" className="h-20 w-20 opacity-60" />
            </div>
          ) : results.length === 0 ? (
            <div
              className={`${SECTION_CARD_SURFACE_CLASS} flex flex-col items-center justify-center py-16 text-center`}
            >
              <StudyDrawing kind="search" className="mb-4 h-14 w-14 opacity-60" />
              <p className="text-sm text-ink-faint">
                {searchQuery.trim() ? (
                  <>Nothing matches &ldquo;{searchQuery}&rdquo;.</>
                ) : (
                  'Nothing matches these filters.'
                )}
              </p>
            </div>
          ) : (
            <>
              <div
                ref={resultList}
                id="search-listbox"
                role="listbox"
                aria-label="Search results"
                className={`${SECTION_CARD_SURFACE_CLASS} p-1.5`}
              >
                {visible.map((hit, index) => (
                  <SearchResultOption
                    key={hitKey(hit)}
                    index={index}
                    hit={hit}
                    query={searchQuery}
                    id={`search-option-${index}`}
                    selected={index === active}
                    onSelect={() => setActive(index)}
                    onOpen={() => void navigate(hitPath(hit))}
                  />
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
        </PageLoadingBoundary>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className={`${SECTION_CARD_SURFACE_CLASS} space-y-2 p-1.5`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1 px-2.5 py-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-1 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
