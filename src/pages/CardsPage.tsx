import { StudyDrawing } from '../components/ui/StudyDrawing';
import { MissingRecord } from '../components/course/MissingRecord';
import { CreateButton } from '../components/ui/CreateButton';
import { useScopedFindShortcut } from '../hooks/useScopedFindShortcut';
import { Skeleton } from '../components/ui/Skeleton';
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
import { useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { originFrom } from '../utils/editorOrigin';
import {
  useCourse,
  useCourseCardProjections,
  useOcclusions,
  useSequences,
  useCourseBankBackingDecks,
} from '../state/useCourseData';
import { CardList } from '../components/cards/CardList';
import { courseCardListContext } from '../components/cards/cardListContext';
import { m as motion } from 'motion/react';
import { MOTION_EASING } from '../components/ui/motion';
import { PlusIcon } from '../components/ui/icons';
import { CardsToolbar, CARD_FILTER_CHIPS } from '../components/cards/CardsToolbar';
import { filterSessionCardPool, searchCardsInScope, type CardFilter } from '../db/search';
import { arrivalDelay } from './settings/SettingsUi';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import type { Card, Lesson, Occlusion, SchedulingUnitRecord, Sequence } from '../db/types';
import { useLessonOrderData } from '../state/useLessonOrderData';

/**
 * Navigate from Cards so the destination's Back returns here with the same search,
 * filters and scroll position (see src/utils/editorOrigin.ts). Editing a lesson-owned
 * card still uses the lesson-scoped route, so without this it would return to the lesson.
 */
function useCardsNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  return (to: string) => void navigate(to, { state: originFrom(location, 'Cards') });
}

function readFilters(value: string | null): ReadonlySet<CardFilter> {
  const known = new Set<string>(CARD_FILTER_CHIPS.map((chip) => chip.value));
  return new Set((value ?? '').split(',').filter((part): part is CardFilter => known.has(part)));
}

export function CardsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const go = useCardsNavigate();
  // Search and filters live in the URL, so returning from an editor restores them.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filters = useMemo(() => readFilters(params.get('f')), [params]);
  const setSearch = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
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
  const lessons = useLessonOrderData(courseId)?.lessons;
  const cards = useCourseCardProjections(courseId);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);
  const lessonIds = useMemo(() => lessons?.map((lesson) => lesson.id) ?? [], [lessons]);
  const backingDecks = useCourseBankBackingDecks(courseId, lessonIds);
  const query = search.trim();
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
  const { byLesson, unassigned, lessonsWithCards, shownCount } = useMemo(() => {
    const availableLessons = lessons ?? [];
    const availableCards = filterSessionCardPool(cards ?? [], {
      filters: [...filters],
      leechThreshold: course?.leechThreshold,
    });
    const lessonIdSet = new Set(availableLessons.map((lesson) => lesson.id));
    const byLesson = new Map<string, Card[]>();
    const unassigned: Card[] = [];
    let shownCount = 0;
    const matches =
      query && course
        ? searchCardsInScope(
            query,
            { cards: availableCards, courses: [course], lessons: availableLessons },
            { parseQuery: true },
          ).map((hit) => hit.card)
        : availableCards;
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
  }, [cards, lessons, query, filters, course]);

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
    return <PageLoading fallback={<CardsPageSkeleton />} />;
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
      <header className={COURSE_PAGE_HEADER}>
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
              setSearch('');
              findReturnFocus.current?.focus();
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
            shown={shownCount}
          />
        </div>
      )}

      {isEmpty ? (
        <div className={`${BUCKET_CLASS} p-6 text-center md:p-8`}>
          <StudyDrawing kind="course" className="mx-auto mb-5" />
          <p className="text-ink-soft">This course has no cards yet.</p>
        </div>
      ) : noMatches ? (
        <div className={`${BUCKET_CLASS} p-6 text-center md:p-8`}>
          <StudyDrawing kind="search" className="mx-auto mb-5" />
          <p className="text-ink-soft">
            {search.trim() ? <>No cards match &ldquo;{search}&rdquo;.</> : 'No cards match.'}
          </p>
          {hasCriteria && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilters(new Set());
              }}
              className="mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className={`${BUCKET_CLASS} flex flex-col`}>
          {lessonsWithCards.map((lesson, index) => (
            <motion.div
              key={lesson.id}
              initial={multiplier > 0 ? { opacity: 0, y: 14 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45 * multiplier,
                delay: arrivalDelay(index, multiplier),
                ease: MOTION_EASING.emphasised,
              }}
            >
              <LessonBucket
                courseId={courseId!}
                lesson={lesson}
                cards={byLesson.get(lesson.id) ?? []}
                deck={backingDecks?.get(lesson.id)}
                assignableLessons={assignableLessons}
                sequences={sequences.filter((s) => s.primaryLessonId === lesson.id)}
                occlusions={occlusions.filter((o) => o.primaryLessonId === lesson.id)}
              />
            </motion.div>
          ))}
          {unassigned.length > 0 && (
            <motion.div
              initial={multiplier > 0 ? { opacity: 0, y: 14 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45 * multiplier,
                delay: arrivalDelay(lessonsWithCards.length, multiplier),
                ease: MOTION_EASING.emphasised,
              }}
            >
              <UnassignedBucket
                courseId={courseId!}
                courseName={course.name}
                cards={unassigned}
                deck={backingDecks?.get(null)}
                assignableLessons={assignableLessons}
                sequences={sequences.filter((s) => s.primaryLessonId === null)}
                occlusions={occlusions.filter((o) => o.primaryLessonId === null)}
              />
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

/** The course's cards share one flat hairline surface; lessons are divided within it. */
const BUCKET_CLASS = 'rounded-3xl bg-surface p-4 card-surface md:p-5';

/** Lessons after the first are divided by a rule; the motion wrapper is each one's parent. */
const LESSON_SECTION_CLASS =
  'pt-2 [div+div>&]:mt-3 [div+div>&]:border-t [div+div>&]:border-line [div+div>&]:pt-5';

interface AssignableLesson {
  id: string;
  name: string;
}

function LessonBucket({
  courseId,
  lesson,
  cards,
  deck,
  assignableLessons,
  sequences,
  occlusions,
}: {
  courseId: string;
  lesson: Lesson;
  cards: Card[];
  deck: SchedulingUnitRecord | undefined;
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
}) {
  const go = useCardsNavigate();
  const heading = (
    <div className="flex min-w-0 flex-1 items-center gap-1 px-1 max-sm:basis-full max-sm:justify-between">
      <h2 className="min-w-0 font-display text-xl font-semibold tracking-tight">
        {lesson.name} <span className="font-normal text-ink-faint">({cards.length})</span>
      </h2>
      <Link
        to={`/course/${courseId}/lesson/${lesson.id}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        Open lesson
      </Link>
    </div>
  );
  return (
    <section className={LESSON_SECTION_CLASS}>
      {deck ? (
        <CardList
          heading={heading}
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: lesson.id,
            importTargetName: lesson.name,
          })}
          hideHeader
          stickyHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) => go(`/course/${courseId}/lesson/${lesson.id}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) => go(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => go(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
        />
      ) : (
        <div className="mb-3">{heading}</div>
      )}
    </section>
  );
}

function UnassignedBucket({
  courseId,
  courseName,
  cards,
  deck,
  assignableLessons,
  sequences,
  occlusions,
}: {
  courseId: string;
  courseName: string;
  cards: Card[];
  deck: SchedulingUnitRecord | undefined;
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
}) {
  const go = useCardsNavigate();
  const heading = (
    <h2 className="px-1 font-display text-xl font-semibold tracking-tight">
      Unassigned <span className="font-normal text-ink-faint">({cards.length})</span>
    </h2>
  );
  return (
    <section className={LESSON_SECTION_CLASS}>
      {deck ? (
        <CardList
          heading={heading}
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: null,
            importTargetName: courseName,
          })}
          hideHeader
          stickyHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) => go(`/course/${courseId}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) => go(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => go(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
        />
      ) : (
        <div className="mb-3">{heading}</div>
      )}
    </section>
  );
}

function CardsPageSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <div className="mb-6 mt-6 flex items-center justify-between md:mt-8">
        <Skeleton className="h-10 w-40 rounded-full bg-ink/10" />
        <Skeleton className="h-11 w-40 rounded-full bg-ink/10" />
      </div>
      <Skeleton className="mb-6 h-12 w-full max-w-sm rounded-full bg-ink/10" />
      <div className="space-y-2 rounded-3xl bg-surface p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl bg-ink/5" />
        ))}
      </div>
    </div>
  );
}
