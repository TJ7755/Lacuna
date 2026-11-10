import { StudyDrawing } from '../components/ui/StudyDrawing';
import { MissingRecord } from '../components/course/MissingRecord';
import { CreateButton } from '../components/ui/CreateButton';
import { useScopedFindShortcut } from '../hooks/useScopedFindShortcut';
// Course Cards — all cards in a course, organised by lesson, with an
// "Unassigned" bucket for cards not yet assigned to a lesson. A toolbar searches and
// filters across every bucket; selecting cards raises the floating bulk bar (CardList).
// Route: /course/:courseId/cards
// British English throughout.

import {
  COURSE_PAGE_FRAME,
  COURSE_PAGE_HEADER,
  COURSE_PAGE_TITLE,
} from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { originFrom } from '../utils/editorOrigin';
import {
  useCourse,
  useCourseCardProjections,
  useLessons,
  useOcclusions,
  useSequences,
  useCourseBankBackingDecks,
} from '../state/useCourseData';
import { CardsResults } from '../components/cards/CardsResults';
import { PlusIcon } from '../components/ui/icons';
import { CardsToolbar, CARD_FILTER_CHIPS } from '../components/cards/CardsToolbar';
import {
  filterSessionCardPool,
  searchCardsInScopeInBatches,
  warmCardSearchContent,
  type CardFilter,
  type SearchScope,
} from '@lacuna/core/db/search';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import type { Card } from '@lacuna/core/db/types';
import { courseLessonOrderPreference, resolveLessonOrder } from '../course/lessonOrder';

/**
 * Navigate from Cards so the destination's Back returns here with the same search,
 * filters and scroll position (see src/utils/editorOrigin.ts). Editing a lesson-owned
 * card still uses the lesson-scoped route, so without this it would return to the lesson.
 */
function useCardsNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  // Results can skip input renders while edit actions still return to the latest URL.
  const committed = useRef({ navigate, location });
  useLayoutEffect(() => {
    committed.current = { navigate, location };
  }, [navigate, location]);
  return useCallback((to: string) => {
    const { navigate, location } = committed.current;
    void navigate(to, { state: originFrom(location, 'Cards') });
  }, []);
}

function readFilters(value: string | null): ReadonlySet<CardFilter> {
  const known = new Set<string>(CARD_FILTER_CHIPS.map((chip) => chip.value));
  return new Set((value ?? '').split(',').filter((part): part is CardFilter => known.has(part)));
}

const NO_CARDS: Card[] = [];

export function CardsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const go = useCardsNavigate();
  // Search and filters live in the URL, so returning from an editor restores them.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filterParam = params.get('f');
  const filters = useMemo(() => readFilters(filterParam), [filterParam]);
  const deferredSearch = useDeferredValue(search);
  const restoreFindFocus = useRef(false);
  const setSearch = (value: string, restoreFocus = false) => {
    restoreFindFocus.current = restoreFocus;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      // A transition-owned input can restore an older value between keystrokes.
      { replace: true, flushSync: true },
    );
  };
  const setFilters = (value: ReadonlySet<CardFilter>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.size) next.set('f', [...value].join(','));
        else next.delete('f');
        return next;
      },
      { replace: true },
    );
  const searchRef = useRef<HTMLInputElement>(null);
  const findReturnFocus = useRef<HTMLElement | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  const course = useCourse(courseId);
  // Course identity and preferences are already live in the shell. Reuse the
  // same lesson read as Course Path instead of loading its assessments again.
  const publishedLessons = useLessons(courseId);
  const preferredOrder = course ? courseLessonOrderPreference(course) : undefined;
  const lessons = useMemo(
    () => publishedLessons && resolveLessonOrder(publishedLessons, preferredOrder),
    [publishedLessons, preferredOrder],
  );
  const cards = useCourseCardProjections(courseId);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);
  const backingDecks = useCourseBankBackingDecks(courseId);
  const query = deferredSearch.trim();
  const hasSearch = search.trim() !== '';
  useEffect(() => {
    if (!cards?.length || hasSearch || typeof window.requestIdleCallback !== 'function') return;
    // Prime only large authored text in spare browser time, and stop on input.
    let index = 0;
    let idle: number;
    const warm = (deadline: IdleDeadline) => {
      const end = performance.now() + 6;
      while (index < cards.length && deadline.timeRemaining() > 2 && performance.now() < end) {
        warmCardSearchContent(cards[index++]!);
      }
      if (index < cards.length) idle = window.requestIdleCallback(warm);
    };
    idle = window.requestIdleCallback(warm);
    return () => window.cancelIdleCallback(idle);
  }, [cards, hasSearch]);
  useScopedFindShortcut(
    cards?.length
      ? () => {
          if (document.activeElement !== searchRef.current) {
            findReturnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      : undefined,
  );
  const assignableLessons = useMemo(
    () => (lessons ?? []).map((lesson) => ({ id: lesson.id, name: lesson.name })),
    [lessons],
  );
  const filterCounts = useMemo(() => {
    const counts = {} as Record<CardFilter, number>;
    for (const chip of CARD_FILTER_CHIPS) {
      counts[chip.value] = filterSessionCardPool(cards ?? [], {
        filters: [chip.value],
        leechThreshold: course?.leechThreshold,
      }).length;
    }
    return counts;
  }, [cards, course?.leechThreshold]);
  const availableCards = useMemo(() => {
    if (query) return NO_CARDS;
    if (!filters.size) return cards ?? NO_CARDS;
    return filterSessionCardPool(cards ?? NO_CARDS, {
      filters: [...filters],
      leechThreshold: course?.leechThreshold,
    });
  }, [cards, filters, course?.leechThreshold, query]);
  const scope = useMemo<SearchScope | null>(
    () =>
      course && lessons && cards && occlusions
        ? { cards, courses: [course], lessons, occlusions }
        : null,
    [course, lessons, cards, occlusions],
  );
  const [result, setResult] = useState<{
    query: string;
    filters: ReadonlySet<CardFilter>;
    scope: SearchScope;
    cards: Card[];
  }>();
  useEffect(() => {
    if (!query || !scope) {
      setResult(scope ? { query: '', filters, scope, cards: availableCards } : undefined);
      return;
    }
    const controller = new AbortController();
    void searchCardsInScopeInBatches(
      query,
      scope,
      { parseQuery: true, filters: [...filters] },
      controller.signal,
    ).then((hits) => {
      if (!hits || controller.signal.aborted) return;
      startTransition(() =>
        setResult((previous) => {
          const lastCards = previous?.scope === scope ? previous.cards : scope.cards;
          const sameOrder =
            hits.length === lastCards.length && hits.every((hit, i) => hit.card === lastCards[i]);
          return {
            query,
            filters,
            scope,
            cards: sameOrder ? lastCards : hits.map((hit) => hit.card),
          };
        }),
      );
    });
    return () => controller.abort();
  }, [query, filters, scope, availableCards]);
  // Keep the last committed list for this course during typing. Until the
  // requested query and scope settle, those cards are only a visual preview.
  const currentResult = query && result?.scope.courses[0]?.id === courseId ? result : undefined;
  const waitingForFirstResult = Boolean(query && !currentResult);
  const pending =
    search.trim() !== query ||
    Boolean(
      query &&
      (currentResult?.scope !== scope ||
        currentResult?.query !== query ||
        currentResult?.filters !== filters),
    );
  useLayoutEffect(() => {
    if (!restoreFindFocus.current || search !== '' || pending) return;
    restoreFindFocus.current = false;
    const target = findReturnFocus.current;
    if (target?.isConnected && document.activeElement === searchRef.current) target.focus();
  }, [pending, search]);
  const matches = query ? (currentResult?.cards ?? NO_CARDS) : availableCards;
  const { byLesson, unassigned, lessonsWithCards, shownCount } = useMemo(() => {
    const availableLessons = lessons ?? [];
    const lessonIdSet = new Set(availableLessons.map((lesson) => lesson.id));
    const byLesson = new Map<string, Card[]>();
    const unassigned: Card[] = [];
    let shownCount = 0;
    for (const card of matches) {
      shownCount += 1;
      if (card.primaryLessonId && lessonIdSet.has(card.primaryLessonId)) {
        const bucket = byLesson.get(card.primaryLessonId) ?? [];
        bucket.push(card);
        byLesson.set(card.primaryLessonId, bucket);
      } else {
        unassigned.push(card);
      }
    }
    return {
      byLesson,
      unassigned,
      shownCount,
      lessonsWithCards: availableLessons.filter(
        (lesson) => (byLesson.get(lesson.id)?.length ?? 0) > 0,
      ),
    };
  }, [lessons, matches]);

  usePageShortcuts({
    '/': cards && cards.length > 0 ? () => searchRef.current?.focus() : undefined,
    n: courseId && course ? () => go(`/course/${courseId}/cards/new`) : undefined,
  });

  if (
    course === undefined ||
    lessons === undefined ||
    cards === undefined ||
    sequences === undefined ||
    occlusions === undefined
  ) {
    return <PageLoading />;
  }
  if (course === null) {
    return (
      <MissingRecord message="This course could not be found." to="/">
        Back to Today
      </MissingRecord>
    );
  }

  const isEmpty = cards.length === 0;
  const noMatches = !isEmpty && lessonsWithCards.length === 0 && unassigned.length === 0;
  const hasCriteria = query !== '' || filters.size > 0;

  function toggleFilter(filter: CardFilter) {
    const next = new Set(filters);
    if (next.has(filter)) next.delete(filter);
    else next.add(filter);
    setFilters(next);
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <header className={`${COURSE_PAGE_HEADER} [&>*]:self-center`}>
        <h1 className={COURSE_PAGE_TITLE}>Cards</h1>
        <CreateButton onClick={() => go(`/course/${courseId}/cards/new`)}>
          <PlusIcon width={18} height={18} />
          New card
        </CreateButton>
      </header>

      {!isEmpty && (
        <div
          className="mb-6"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && event.target === searchRef.current) {
              event.preventDefault();
              if (search === '' && !pending) findReturnFocus.current?.focus();
              else setSearch('', true);
            }
          }}
        >
          <CardsToolbar
            search={search}
            searchRef={searchRef}
            onSearch={setSearch}
            filters={filters}
            onToggleFilter={toggleFilter}
            counts={filterCounts}
            shown={waitingForFirstResult ? undefined : shownCount}
            pending={pending}
          />
        </div>
      )}

      {isEmpty ? (
        <div className={`${BUCKET_CLASS} p-6 text-center md:p-8`}>
          <StudyDrawing kind="course" className="mx-auto mb-5" />
          <h2 className="mb-2 font-display text-xl font-semibold tracking-tight">
            This course has no cards yet.
          </h2>
          <p className="text-sm text-ink-soft">Choose New card to start building your recall.</p>
        </div>
      ) : waitingForFirstResult ? (
        <PageLoading />
      ) : noMatches ? (
        <div className={`${BUCKET_CLASS} p-6 text-center md:p-8`}>
          <StudyDrawing kind="search" className="mx-auto mb-5" />
          <p className="text-ink-soft">
            {currentResult?.query ? (
              <>No cards match &ldquo;{currentResult.query}&rdquo;.</>
            ) : (
              'No cards match.'
            )}
          </p>
          {hasCriteria && (
            <button
              type="button"
              onClick={() => {
                setParams(
                  (previous) => {
                    const next = new URLSearchParams(previous);
                    next.delete('q');
                    next.delete('f');
                    return next;
                  },
                  { replace: true },
                );
              }}
              className="mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className={`${BUCKET_CLASS} flex flex-col`} inert={pending}>
          <CardsResults
            courseId={courseId!}
            courseName={course.name}
            multiplier={multiplier}
            lessonsWithCards={lessonsWithCards}
            unassigned={unassigned}
            byLesson={byLesson}
            shownCount={shownCount}
            backingDecks={backingDecks}
            assignableLessons={assignableLessons}
            sequences={sequences}
            occlusions={occlusions}
            go={go}
          />
        </div>
      )}
    </div>
  );
}

/** The course's cards share one flat hairline surface; lessons are divided within it. */
const BUCKET_CLASS = 'rounded-3xl bg-surface p-4 card-surface md:p-5';
