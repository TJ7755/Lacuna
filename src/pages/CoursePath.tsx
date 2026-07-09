// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { db } from '../db/schema';
import {
  useLessons,
  useCourseExamDates,
  useCourseCards,
  useCourseSummaries,
  usePracticeNodes,
} from '../state/useCourseData';
import { availableCards } from '../fsrs/eligibility';
import { DEFAULT_REVIEW_SECONDS } from '../fsrs/stats';
import { buildPath, pathPosition } from '../course/path';
import type { PathNode } from '../course/path';
import { PathNodeView } from '../components/course/PathNodeView';
import { PathLine } from '../components/course/PathLine';
import { LessonView } from './LessonView';
import { ChevronLeftIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { formatDate } from '../utils/datetime';
import type { Card, Course } from '../db/types';

/**
 * Course-wide mean seconds per review, re-scoped from the existing per-deck
 * response-time calibration (see `src/fsrs/stats.ts`'s `computeStudyStats`) to
 * a Course: an unweighted mean across the distinct decks backing the course's
 * cards, falling back to the same default a single uncalibrated deck would use.
 */
function courseMeanReviewSeconds(cards: Card[], deckSeconds: Map<string, number>): number {
  let sum = 0;
  let count = 0;
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.deckId)) continue;
    seen.add(card.deckId);
    const seconds = deckSeconds.get(card.deckId);
    if (seconds === undefined) continue;
    sum += seconds;
    count += 1;
  }
  return count > 0 ? sum / count : DEFAULT_REVIEW_SECONDS;
}

export function CoursePath() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Use a null-sentinel to distinguish "loading" (undefined) from "not found" (null).
  // When courseId is absent the query resolves immediately to null.
  const course = useLiveQuery<Course | null>(
    () =>
      courseId
        ? db.courses.get(courseId).then((c) => c ?? null)
        : Promise.resolve(null),
    [courseId],
  );
  const lessons = useLessons(courseId);
  const examDates = useCourseExamDates(courseId);
  const courseCards = useCourseCards(courseId);
  const summaries = useCourseSummaries();
  const practiceNodes = usePracticeNodes(courseId);
  // Per-deck response-time calibration for the decks backing this course's cards,
  // re-scoped into a single course-wide mean (see courseMeanReviewSeconds above).
  const deckIds = courseCards ? Array.from(new Set(courseCards.map((c) => c.deckId))) : [];
  const perf = useLiveQuery(
    () => (deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : []),
    [deckIds.join(',')],
  );

  // Loading state — match DeckView's skeleton approach.
  if (
    course === undefined ||
    lessons === undefined ||
    examDates === undefined ||
    courseCards === undefined ||
    summaries === undefined ||
    practiceNodes === undefined ||
    perf === undefined
  ) {
    return <CoursePathSkeleton />;
  }

  // Course not found.
  if (course === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-10"
      >
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <p className="mb-4 text-ink-soft">This course could not be found.</p>
          <Link to="/" className="text-accent underline">
            Back to dashboard
          </Link>
        </div>
      </motion.div>
    );
  }

  // Single-lesson branch (addendum E): render the lesson view directly rather than
  // showing a one-item path. No redirect — this is a rendering branch.
  if (lessons.length === 1) {
    return <LessonView courseId={courseId} lessonId={lessons[0].id} />;
  }

  const summary = summaries[course.id];

  // Build lessonCardsById: group course cards by primaryLessonId.
  const lessonCardsById = new Map<string, Card[]>();
  for (const card of courseCards) {
    if (card.primaryLessonId) {
      const bucket = lessonCardsById.get(card.primaryLessonId) ?? [];
      bucket.push(card);
      lessonCardsById.set(card.primaryLessonId, bucket);
    }
  }

  // Live due-card count and mean review time, feeding shouldInsertPractice (addendum 2 §H).
  const now = Date.now();
  const dueCardCount = availableCards(courseCards, now).filter(
    (c) => c.due !== null && c.due !== undefined && c.due <= now,
  ).length;
  const deckSeconds = new Map<string, number>();
  for (const p of perf) {
    if (p.totalCorrectReviews > 0 && p.runningMeanResponseTime > 0) {
      deckSeconds.set(p.deckId, p.runningMeanResponseTime);
    }
  }
  const meanReviewSeconds = courseMeanReviewSeconds(courseCards, deckSeconds);

  const nodes = buildPath(
    course,
    lessons,
    examDates,
    lessonCardsById,
    practiceNodes,
    dueCardCount,
    meanReviewSeconds,
    now,
  );

  // Curriculum position (addendum J): counts non-extension lessons reached.
  // This is pacing — it has nothing to do with mastery or FSRS retention.
  const { reached, total } = pathPosition(nodes);

  // Mastery: FSRS-derived mean predicted retention across the card pool,
  // expressed as a percentage. Distinct from path position.
  const masteryPct = summary ? Math.round(summary.mastery * 100) : 0;

  // Nearest upcoming exam date: consider course.examDate and all explicit exam dates;
  // show the soonest one that is still in the future.
  const futureDates = [
    course.examDate,
    ...examDates.map((ed) => ed.examDate),
  ].filter((d) => d > now);
  const nearestExam = futureDates.length > 0
    ? Math.min(...futureDates)
    : course.examDate; // Fall back to the primary date even if it has passed.

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          All courses
        </Link>
        <Link
          to={`/course/${courseId}/bank`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          Question bank
        </Link>
      </div>

      {/* Header */}
      <header className="relative mb-10 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <div className="mb-1 text-sm uppercase tracking-[0.16em] text-ink-faint">
            Exam {formatDate(nearestExam, course.timeZone)}
          </div>
          <h1 className="mb-5 font-display text-4xl tracking-tight md:text-5xl">
            {course.name}
          </h1>
          <div className="flex flex-wrap gap-6">
            {/*
             * Curriculum position: how many lessons the student has reached.
             * This is a pacing metric and is SEPARATE from mastery.
             */}
            <div className="text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-ink-faint">
                Curriculum position
              </span>
              <p className="mt-0.5 font-medium text-ink">
                Lesson {reached} of {total}
              </p>
            </div>
            {/*
             * Mastery: mean predicted FSRS retention across the card pool.
             * A different metric from curriculum position.
             */}
            <div className="text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-ink-faint">
                Mastery
              </span>
              <p className="mt-0.5 font-medium text-ink">{masteryPct}%</p>
            </div>
          </div>
        </div>
      </header>

      {/* Course path */}
      {nodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-soft">This course has no lessons yet.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          {nodes.map((node, i) => (
            <PathNodeWithLine
              key={node.id}
              node={node}
              isLast={i === nodes.length - 1}
              onLessonClick={(lessonId) =>
                navigate(`/course/${courseId}/lesson/${lessonId}`)
              }
              onPracticeClick={() => navigate(`/course/${courseId}/learn`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a single path node followed by its connecting line (if not the last node).
 * The connecting line is accent-tinted when the preceding node is a completed lesson,
 * indicating the student has already cleared that stretch of the path.
 */
function PathNodeWithLine({
  node,
  isLast,
  onLessonClick,
  onPracticeClick,
}: {
  node: PathNode;
  isLast: boolean;
  onLessonClick: (lessonId: string) => void;
  onPracticeClick: () => void;
}) {
  // A segment is completed when the node it trails is a completed lesson.
  // Checkpoints and available/locked lessons leave the segment neutral.
  const segmentCompleted =
    !isLast && node.nodeType === 'lesson' && node.status === 'completed';

  return (
    <div className="flex flex-col items-center">
      <PathNodeView node={node} onLessonClick={onLessonClick} onPracticeClick={onPracticeClick} />
      {!isLast && <PathLine completed={segmentCompleted} />}
    </div>
  );
}

function CoursePathSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-10 rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="mb-1 h-3 w-40 animate-pulse rounded bg-ink/10" />
        <div className="mb-5 h-10 w-64 animate-pulse rounded bg-ink/10 md:w-80" />
        <div className="flex gap-6">
          <div>
            <div className="mb-1 h-2.5 w-28 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-20 animate-pulse rounded bg-ink/10" />
          </div>
          <div>
            <div className="mb-1 h-2.5 w-16 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-12 animate-pulse rounded bg-ink/10" />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-14 w-14 animate-pulse rounded-full bg-ink/10" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-ink/10" />
            {i < 3 && <div className="my-1 h-8 w-1 animate-pulse rounded-full bg-ink/10" />}
          </div>
        ))}
      </div>
    </div>
  );
}
