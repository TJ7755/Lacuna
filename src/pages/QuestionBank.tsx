// Course Question Bank — all cards in a course, organised by lesson, with an
// "Unassigned" bucket for cards not yet assigned to a lesson.
// Route: /course/:courseId/bank
// British English throughout.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import {
  useCourse,
  useLessons,
  useCourseCards,
  useOcclusions,
  useSequences,
  useLessonBackingDeck,
  useCourseBankBackingDeck,
} from '../state/useCourseData';
import { CardList } from '../components/cards/CardList';
import { courseCardListContext } from '../components/cards/cardListContext';
import { CourseTabs } from '../components/course/CourseTabs';
import { FadeInView } from '../components/ui/FadeInView';
import { Button } from '../components/ui/Button';
import { BatchAuthoringPromptDialog } from '../components/items/BatchAuthoringPromptDialog';
import { ChevronLeftIcon, PlusIcon, SearchIcon, SparklesIcon } from '../components/ui/icons';
import type { Card, Lesson, Occlusion, Sequence } from '../db/types';

// Editing a lesson-owned card still uses the lesson-scoped route (so the editor's
// duplicate check and tag suggestions stay scoped to the lesson's own deck), but the
// user opened it from here, so the back-link should return to the Question bank
// rather than the lesson — see src/utils/editorOrigin.ts.
function bankOrigin(courseId: string) {
  return { origin: { path: `/course/${courseId}/bank`, label: 'Question bank' } };
}

export function QuestionBank() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showBatchPrompt, setShowBatchPrompt] = useState(false);

  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCards(courseId);
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);

  if (
    course === undefined ||
    lessons === undefined ||
    cards === undefined ||
    sequences === undefined ||
    occlusions === undefined
  ) {
    return <QuestionBankSkeleton />;
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">Back to dashboard</Link>
      </div>
    );
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
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          All courses
        </Link>
        <CourseTabs courseId={courseId ?? ''} />
      </div>

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Question bank</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {cards.length} card{cards.length === 1 ? '' : 's'} across {course.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setShowBatchPrompt(true)}>
            <SparklesIcon width={18} height={18} />
            Build external batch prompt
          </Button>
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
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" onClick={() => navigate(`/course/${courseId}/cards/new`)}>
              <PlusIcon width={18} height={18} />
              New card
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/course/${courseId}/sequence/new`)}>
              <PlusIcon width={18} height={18} />
              New sequence
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/course/${courseId}/occlusion/new`)}>
              <PlusIcon width={18} height={18} />
              New occlusion
            </Button>
          </div>
        </div>
      ) : noMatches ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-soft">No cards match &ldquo;{search}&rdquo;.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {lessonsWithCards.map((lesson, index) => (
            <FadeInView key={lesson.id} delay={index * 0.04} y={12}>
              <LessonBucket
                courseId={courseId!}
                lesson={lesson}
                cards={byLesson.get(lesson.id) ?? []}
                assignableLessons={assignableLessons}
                sequences={sequences.filter((s) => s.primaryLessonId === lesson.id)}
                occlusions={occlusions.filter((o) => o.primaryLessonId === lesson.id)}
              />
            </FadeInView>
          ))}
          {unassigned.length > 0 && (
            <FadeInView delay={lessonsWithCards.length * 0.04} y={12}>
              <UnassignedBucket
                courseId={courseId!}
                courseName={course.name}
                cards={unassigned}
                assignableLessons={assignableLessons}
                sequences={sequences.filter((s) => s.primaryLessonId === null)}
                occlusions={occlusions.filter((o) => o.primaryLessonId === null)}
              />
            </FadeInView>
          )}
        </div>
      )}

      <AnimatePresence>
        {showBatchPrompt && (
          <BatchAuthoringPromptDialog
            courseId={course.id}
            courseName={course.name}
            examBoard={course.examBoard}
            specification={course.specification}
            lessons={lessons}
            cards={cards}
            onClose={() => setShowBatchPrompt(false)}
          />
        )}
      </AnimatePresence>
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
  sequences,
  occlusions,
}: {
  courseId: string;
  lesson: Lesson;
  cards: Card[];
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
}) {
  const navigate = useNavigate();
  // Resolve the hidden scheduling deck through the Course/Lesson data boundary,
  // rather than discovering it from card.deckId.
  const deck = useLessonBackingDeck(courseId, lesson.id);

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
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: lesson.id,
            importTargetName: lesson.name,
          })}
          hideHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/cards/${card.id}/edit`, {
              state: bankOrigin(courseId),
            })
          }
          onNewCard={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/cards/new`, {
              state: bankOrigin(courseId),
            })
          }
          onNewSequence={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/sequence/new`, {
              state: bankOrigin(courseId),
            })
          }
          onNewOcclusion={() =>
            navigate(`/course/${courseId}/lesson/${lesson.id}/occlusion/new`, {
              state: bankOrigin(courseId),
            })
          }
          sequences={sequences}
          onEditSequence={(sequenceId) => navigate(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => navigate(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
        />
      )}
    </section>
  );
}

function UnassignedBucket({
  courseId,
  courseName,
  cards,
  assignableLessons,
  sequences,
  occlusions,
}: {
  courseId: string;
  courseName: string;
  cards: Card[];
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
}) {
  const navigate = useNavigate();
  // Resolve the hidden course-bank scheduling deck through the Course/Lesson data
  // boundary, rather than discovering it from card.deckId.
  const deck = useCourseBankBackingDeck(courseId);

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
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: null,
            importTargetName: courseName,
          })}
          hideHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onNewCard={() => navigate(`/course/${courseId}/cards/new`)}
          onNewSequence={() => navigate(`/course/${courseId}/sequence/new`)}
          onNewOcclusion={() => navigate(`/course/${courseId}/occlusion/new`)}
          onEditCard={(card) => navigate(`/course/${courseId}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) => navigate(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => navigate(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
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
