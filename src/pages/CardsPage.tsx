import { Skeleton } from '../components/ui/Skeleton';
// Course Cards — all cards in a course, organised by lesson, with an
// "Unassigned" bucket for cards not yet assigned to a lesson. A toolbar searches and
// filters across every bucket; selecting cards raises the floating bulk bar (CardList).
// Route: /course/:courseId/cards
// British English throughout.

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCourse,
  useLessons,
  useCourseCardProjections,
  useOcclusions,
  useSequences,
  useCourseBankBackingDecks,
} from '../state/useCourseData';
import { CardList } from '../components/cards/CardList';
import { courseCardListContext } from '../components/cards/cardListContext';
import { m as motion } from 'motion/react';
import { MOTION_EASING } from '../components/ui/motion';
import { Button } from '../components/ui/Button';
import { PlusIcon } from '../components/ui/icons';
import { CardsToolbar, CARD_FILTER_CHIPS } from '../components/cards/CardsToolbar';
import { filterSessionCardPool, type CardFilter } from '../db/search';
import { arrivalDelay } from './settings/SettingsUi';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import type { Card, Lesson, Occlusion, SchedulingUnitRecord, Sequence } from '../db/types';

// Editing a lesson-owned card still uses the lesson-scoped route (so the editor's
// duplicate check and tag suggestions stay scoped to the lesson's own deck), but the
// user opened it from here, so the back-link should return to Cards
// rather than the lesson — see src/utils/editorOrigin.ts.
function cardsOrigin(courseId: string) {
  return { origin: { path: `/course/${courseId}/cards`, label: 'Cards' } };
}

export function CardsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<CardFilter>>(new Set());
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCardProjections(courseId);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);
  const lessonIds = useMemo(() => lessons?.map((lesson) => lesson.id) ?? [], [lessons]);
  const backingDecks = useCourseBankBackingDecks(courseId, lessonIds);
  const query = search.trim().toLowerCase();
  const assignableLessons = useMemo(
    () => (lessons ?? []).map((lesson) => ({ id: lesson.id, name: lesson.name })),
    [lessons],
  );
  const filterCounts = useMemo(() => {
    const counts = {} as Record<CardFilter, number>;
    for (const chip of CARD_FILTER_CHIPS) {
      counts[chip.value] = filterSessionCardPool(cards ?? [], { filters: [chip.value] }).length;
    }
    return counts;
  }, [cards]);
  const { byLesson, unassigned, lessonsWithCards, shownCount } = useMemo(() => {
    const availableLessons = lessons ?? [];
    const availableCards = filterSessionCardPool(cards ?? [], { filters: [...filters] });
    const lessonIdSet = new Set(availableLessons.map((lesson) => lesson.id));
    const byLesson = new Map<string, Card[]>();
    const unassigned: Card[] = [];
    let shownCount = 0;
    for (const card of availableCards) {
      if (
        query &&
        !card.front.toLowerCase().includes(query) &&
        !card.back.toLowerCase().includes(query)
      ) {
        continue;
      }
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
  }, [cards, lessons, query, filters]);

  if (
    course === undefined ||
    lessons === undefined ||
    cards === undefined ||
    sequences === undefined ||
    occlusions === undefined
  ) {
    return (
      <DelayedFallback>
        <CardsPageSkeleton />
      </DelayedFallback>
    );
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to Today
        </Link>
      </div>
    );
  }

  const isEmpty = cards.length === 0;
  const noMatches = !isEmpty && lessonsWithCards.length === 0 && unassigned.length === 0;
  const hasCriteria = query !== '' || filters.size > 0;

  function toggleFilter(filter: CardFilter) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-12`}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-6 md:pt-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">Cards</h1>
        <div role="group" aria-label="Add content" className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/course/${courseId}/sequence/new`)}>
            <PlusIcon width={18} height={18} />
            New sequence
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/course/${courseId}/occlusion/new`)}>
            <PlusIcon width={18} height={18} />
            New occlusion
          </Button>
          <Button variant="primary" onClick={() => navigate(`/course/${courseId}/cards/new`)}>
            <PlusIcon width={18} height={18} />
            New card
          </Button>
        </div>
      </header>

      {!isEmpty && (
        <div className="mb-6">
          <CardsToolbar
            search={search}
            onSearch={setSearch}
            filters={filters}
            onToggleFilter={toggleFilter}
            counts={filterCounts}
            shown={shownCount}
          />
        </div>
      )}

      {isEmpty ? (
        <div className={`${BUCKET_CLASS} py-16 text-center`}>
          <p className="text-ink-soft">This course has no cards yet.</p>
        </div>
      ) : noMatches ? (
        <div className={`${BUCKET_CLASS} py-16 text-center`}>
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
              className="mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
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

/** Each lesson's cards sit on one borderless surface, like the cards elsewhere. */
const BUCKET_CLASS =
  'rounded-3xl bg-surface p-4 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:p-5';

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
  const navigate = useNavigate();
  return (
    <section className={BUCKET_CLASS}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {lesson.name} <span className="font-normal text-ink-faint">({cards.length})</span>
        </h2>
        <Link
          to={`/course/${courseId}/lesson/${lesson.id}`}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Open lesson
        </Link>
      </div>
      {deck && (
        <CardList
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: lesson.id,
            importTargetName: lesson.name,
          })}
          hideHeader
          quietNewCard
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/cards/${card.id}/edit`, {
              state: cardsOrigin(courseId),
            })
          }
          onNewCard={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/cards/new`, {
              state: cardsOrigin(courseId),
            })
          }
          onNewSequence={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/sequence/new`, {
              state: cardsOrigin(courseId),
            })
          }
          onNewOcclusion={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/occlusion/new`, {
              state: cardsOrigin(courseId),
            })
          }
          sequences={sequences}
          onEditSequence={(sequenceId) =>
            navigate(`/course/${courseId}/sequence/${sequenceId}/edit`)
          }
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) =>
            navigate(`/course/${courseId}/occlusion/${occlusionId}/edit`)
          }
        />
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
  const navigate = useNavigate();
  return (
    <section className={BUCKET_CLASS}>
      <div className="mb-3 px-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Unassigned <span className="font-normal text-ink-faint">({cards.length})</span>
        </h2>
      </div>
      {deck && (
        <CardList
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: null,
            importTargetName: courseName,
          })}
          hideHeader
          quietNewCard
          courseId={courseId}
          assignableLessons={assignableLessons}
          onNewCard={() => navigate(`/course/${courseId}/cards/new`)}
          onNewSequence={() => navigate(`/course/${courseId}/sequence/new`)}
          onNewOcclusion={() => navigate(`/course/${courseId}/occlusion/new`)}
          onEditCard={(card) => navigate(`/course/${courseId}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) =>
            navigate(`/course/${courseId}/sequence/${sequenceId}/edit`)
          }
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) =>
            navigate(`/course/${courseId}/occlusion/${occlusionId}/edit`)
          }
        />
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
