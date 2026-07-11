// Course Question Bank — all cards in a course, organised by lesson, with an
// "Unassigned" bucket for cards not yet assigned to a lesson.
// Route: /course/:courseId/bank
// British English throughout.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCourse, useLessons, useCourseCards } from '../state/useCourseData';
import { useDeck } from '../state/useData';
import { CardList } from '../components/cards/CardList';
import { Button } from '../components/ui/Button';
import { ChevronLeftIcon, PlusIcon, SearchIcon } from '../components/ui/icons';
import type { Card, Lesson } from '../db/types';

export function QuestionBank() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCards(courseId);

  if (course === undefined || lessons === undefined || cards === undefined) {
    return <QuestionBankSkeleton />;
  }

  const query = search.trim().toLowerCase();
  const matches = (card: Card) =>
    !query || card.front.toLowerCase().includes(query) || card.back.toLowerCase().includes(query);

  // Group cards by primaryLessonId, preserving lesson order; anything without a
  // (recognised) lesson falls into the Unassigned bucket.
  const lessonIds = new Set(lessons.map((l) => l.id));
  const byLesson = new Map<string, Card[]>();
  const unassigned: Card[] = [];
  for (const card of cards) {
    if (!matches(card)) continue;
    if (card.primaryLessonId && lessonIds.has(card.primaryLessonId)) {
      const bucket = byLesson.get(card.primaryLessonId) ?? [];
      bucket.push(card);
      byLesson.set(card.primaryLessonId, bucket);
    } else {
      unassigned.push(card);
    }
  }

  const assignableLessons = lessons.map((l) => ({ id: l.id, name: l.name }));
  const lessonsWithCards = lessons.filter((l) => (byLesson.get(l.id)?.length ?? 0) > 0);
  const isEmpty = cards.length === 0;
  const noMatches = !isEmpty && lessonsWithCards.length === 0 && unassigned.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <Link
        to={`/course/${courseId}`}
        className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        {course.name}
      </Link>

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Question bank</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {cards.length} card{cards.length === 1 ? '' : 's'} across {course.name}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate(`/course/${courseId}/cards/new`)}>
          <PlusIcon width={18} height={18} />
          Create new card
        </Button>
      </header>

      {/* Search */}
      {!isEmpty && (
        <div className="relative mb-8">
          <SearchIcon
            width={16}
            height={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all cards…"
            className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-10 pr-4 text-ink outline-none focus:border-accent"
          />
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="mb-4 text-sm text-ink-soft">This course has no cards yet.</p>
          <Button variant="primary" onClick={() => navigate(`/course/${courseId}/cards/new`)}>
            <PlusIcon width={18} height={18} />
            Create your first card
          </Button>
        </div>
      ) : noMatches ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-soft">No cards match &ldquo;{search}&rdquo;.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {lessonsWithCards.map((lesson) => (
            <LessonBucket
              key={lesson.id}
              courseId={courseId!}
              lesson={lesson}
              cards={byLesson.get(lesson.id) ?? []}
              assignableLessons={assignableLessons}
            />
          ))}
          {unassigned.length > 0 && (
            <UnassignedBucket
              courseId={courseId!}
              cards={unassigned}
              assignableLessons={assignableLessons}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface AssignableLesson {
  id: string;
  name: string;
}

function LessonBucket({
  courseId,
  lesson,
  cards,
  assignableLessons,
}: {
  courseId: string;
  lesson: Lesson;
  cards: Card[];
  assignableLessons: AssignableLesson[];
}) {
  const navigate = useNavigate();
  // Invariant (assignCardsToLesson): every card assigned to a lesson shares that
  // lesson's single backing deck, so the bucket's deck can be read off the first card.
  const deckId = cards[0]?.deckId;
  if (import.meta.env.DEV) {
    const stray = cards.find((c) => c.deckId !== deckId);
    if (stray) {
      console.warn(
        `QuestionBank: lesson "${lesson.name}" has cards from more than one deck ` +
          `(expected ${deckId}, found ${stray.deckId} on card ${stray.id}).`,
      );
    }
  }
  const deck = useDeck(deckId);
  const allDecks = useMemo(() => (deck ? [deck] : []), [deck]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl">
          {lesson.name} <span className="text-ink-faint">({cards.length})</span>
        </h2>
        <Link
          to={`/course/${courseId}/lesson/${lesson.id}`}
          className="text-sm text-ink-faint transition-colors hover:text-ink"
        >
          Open lesson
        </Link>
      </div>
      {deck && (
        <CardList
          cards={cards}
          deck={deck}
          allDecks={allDecks}
          hideHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/cards/${card.id}/edit`)
          }
        />
      )}
    </section>
  );
}

function UnassignedBucket({
  courseId,
  cards,
  assignableLessons,
}: {
  courseId: string;
  cards: Card[];
  assignableLessons: AssignableLesson[];
}) {
  const navigate = useNavigate();
  // Invariant (assignCardsToLesson): unassigned cards all share the course's lazy
  // bank deck, so the bucket's deck can be read off the first card.
  const deckId = cards[0]?.deckId;
  if (import.meta.env.DEV) {
    const stray = cards.find((c) => c.deckId !== deckId);
    if (stray) {
      console.warn(
        `QuestionBank: Unassigned bucket has cards from more than one deck ` +
          `(expected ${deckId}, found ${stray.deckId} on card ${stray.id}).`,
      );
    }
  }
  const deck = useDeck(deckId);
  const allDecks = useMemo(() => (deck ? [deck] : []), [deck]);

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl">
          Unassigned <span className="text-ink-faint">({cards.length})</span>
        </h2>
      </div>
      {deck && (
        <CardList
          cards={cards}
          deck={deck}
          allDecks={allDecks}
          hideHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onNewCard={() => navigate(`/course/${courseId}/cards/new`)}
          onEditCard={(card) => navigate(`/course/${courseId}/cards/${card.id}/edit`)}
        />
      )}
    </section>
  );
}

function QuestionBankSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 flex items-center justify-between">
        <div className="h-10 w-64 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-ink/10" />
      </div>
      <div className="mb-8 h-10 w-full animate-pulse rounded-xl bg-ink/10" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-ink/5" />
        ))}
      </div>
    </div>
  );
}
