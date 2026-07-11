// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { db } from '../db/schema';
import {
  useLessons,
  useCourseExamDates,
  useCourseCards,
  useCourseSummary,
  usePracticeNodes,
} from '../state/useCourseData';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { DEFAULT_REVIEW_SECONDS, buildDeckSecondsMap } from '../fsrs/stats';
import { progressValue } from '../fsrs/objective';
import { MS_PER_DAY } from '../fsrs/params';
import { buildPath, pathPosition, lessonEffectiveReleaseDates } from '../course/path';
import { courseHeaderStats } from '../course/headerStats';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { AddLessonControl } from '../components/course/AddLessonControl';
import {
  PathNodeWithLine,
  InsertGap,
  computeLineInserts,
  lockHintFor,
} from '../components/course/CoursePathSegment';
import { CourseHeader } from '../components/course/CourseHeader';
import { fieldStandfirst } from '../components/course/memoryFieldMath';
import { LessonView } from './LessonView';
import { Button } from '../components/ui/Button';
import {
  ChartIcon,
  ChevronLeftIcon,
  PlayIcon,
  SettingsIcon,
} from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { formatDate } from '../utils/datetime';
import type { Card, Course, PracticeNode } from '../db/types';

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
  // State for the manual practice-node editor modal (see PracticeNodeEditor):
  // 'new' with a seeded position when opened from a "+" insertion point, or an
  // existing PracticeNode when opened from a node's edit badge.
  const [editorState, setEditorState] = useState<
    { mode: 'new'; defaultPosition?: number } | { mode: 'edit'; node: PracticeNode } | null
  >(null);

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
  const summary = useCourseSummary(courseId);
  const practiceNodes = usePracticeNodes(courseId);
  // Per-deck response-time calibration for the decks backing this course's cards,
  // re-scoped into a single course-wide mean (see courseMeanReviewSeconds above).
  const deckIds = useMemo(
    () => (courseCards ? Array.from(new Set(courseCards.map((c) => c.deckId))) : []),
    [courseCards],
  );
  const perf = useLiveQuery(
    () => (deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : []),
    [deckIds.join(',')],
  );

  const dataLoaded =
    course !== undefined &&
    lessons !== undefined &&
    examDates !== undefined &&
    courseCards !== undefined &&
    summary !== undefined &&
    practiceNodes !== undefined &&
    perf !== undefined;

  // Build lessonCardsById: group course cards by primaryLessonId.
  // Hooks below must run unconditionally (Rules of Hooks), so they tolerate
  // not-yet-loaded data via fallbacks and are only consumed once `dataLoaded`.
  const lessonCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of courseCards ?? []) {
      if (card.primaryLessonId) {
        const bucket = map.get(card.primaryLessonId) ?? [];
        bucket.push(card);
        map.set(card.primaryLessonId, bucket);
      }
    }
    return map;
  }, [courseCards]);

  // Live due-card count and mean review time, feeding shouldInsertPractice (addendum 2 §H).
  const now = Date.now();
  const { dueCardCount, meanReviewSeconds } = useMemo(() => {
    const dueCardCount = dueCards(availableCards(courseCards ?? [], now), now).length;
    const deckSeconds = buildDeckSecondsMap(perf ?? []);
    const meanReviewSeconds = courseMeanReviewSeconds(courseCards ?? [], deckSeconds);
    return { dueCardCount, meanReviewSeconds };
    // `now` is deliberately excluded: recomputation is scoped to data changes
    // (cards/perf), not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseCards, perf]);

  const nodes = useMemo(
    () =>
      course && lessons && examDates && practiceNodes
        ? buildPath(
            course,
            lessons,
            examDates,
            lessonCardsById,
            practiceNodes,
            dueCardCount,
            meanReviewSeconds,
            now,
          )
        : [],
    // `now` is deliberately excluded: recomputation is scoped to data changes,
    // not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, lessons, examDates, lessonCardsById, practiceNodes, dueCardCount, meanReviewSeconds],
  );

  // Loading state — a skeleton while course/lesson data resolves.
  if (!dataLoaded) {
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

  // Precomputed for the manual practice-node insertion affordances (see InsertGap/
  // InsertButton below): which lines on the path may host a "+", and the position
  // value ("end of course") the trailing insertion point should seed a new node with.
  const lineInserts = computeLineInserts(nodes);
  // Release-date map for the "locked" hint (see lockHintFor below) — only
  // consulted under `linear` unlock mode.
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);
  // The single next-up lesson gets the "you are here" halo (see LessonNode):
  // the first lesson node on the path still in 'available' status.
  const currentNodeId = nodes.find(
    (n) => n.nodeType === 'lesson' && n.status === 'available',
  )?.id;
  const lastLessonOrderIndex = lessons[lessons.length - 1]?.orderIndex;

  // Curriculum position (addendum J): counts non-extension lessons reached.
  // This is pacing — it has nothing to do with mastery or FSRS retention.
  const { reached, total } = pathPosition(nodes);

  // Header stats: nearest exam + urgency use the same maths as LessonView's
  // (see courseHeaderStats); mastery is passed in from the course-level summary
  // (extension-lesson cards already excluded there), and dueCardCount reuses
  // the value already computed above for buildPath rather than recomputing it.
  const { nearestExam, examUrgent, mastery } = courseHeaderStats(
    course,
    examDates,
    courseCards,
    summary?.mastery ?? 0,
    now,
  );
  const masteryPct = Math.round(mastery * 100);

  // Hover detail for a lesson node's expanding squircle (see LessonNode).
  const detailForLesson = (lessonId: string) => {
    const cards = lessonCardsById.get(lessonId) ?? [];
    return {
      cardCount: cards.length,
      dueCount: dueCards(availableCards(cards, now), now).length,
      masteryPct: Math.round(progressValue(cards, course, now) * 100),
    };
  };
  const unseenCount = courseCards.filter(
    (c) => c.lastReviewed === null || c.state === 0,
  ).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          All courses
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to={`/course/${courseId}/bank`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
          >
            Question bank
          </Link>
          <Link
            to={`/course/${courseId}/analytics`}
            aria-label="Course analytics"
            title="Course analytics"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-faint transition-colors hover:text-ink active:text-ink"
          >
            <ChartIcon width={18} height={18} />
          </Link>
          <Link
            to={`/course/${courseId}/settings`}
            aria-label="Course settings"
            title="Course settings"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-faint transition-colors hover:text-ink active:text-ink"
          >
            <SettingsIcon width={18} height={18} />
          </Link>
        </div>
      </div>

      {/* Header — title, a one-sentence editorial standfirst, and the Study
          action. */}
      <CourseHeader
        className="mb-12"
        eyebrow={`Exam ${formatDate(nearestExam, course.timeZone)}`}
        examUrgent={examUrgent}
        title={course.name}
      >
        <div>
          <p className="max-w-prose text-sm text-ink-soft">
            {fieldStandfirst({
              dueCount: dueCardCount,
              masteryPct,
              daysToExam: Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0),
              totalCards: courseCards.length,
              unseenCount,
            })}{' '}
            Lesson {reached} of {total} reached.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              size="lg"
              disabled={courseCards.length === 0}
              onClick={() => navigate(`/course/${courseId}/learn`)}
            >
              <PlayIcon width={18} height={18} />
              Study
              {dueCardCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fg/20 px-1.5 text-xs font-semibold tabular-nums">
                  {dueCardCount}
                </span>
              )}
            </Button>
            <p className="text-sm text-ink-faint">
              {courseCards.length === 0
                ? 'Add cards to begin studying.'
                : dueCardCount > 0
                  ? `${dueCardCount} card${dueCardCount === 1 ? '' : 's'} ready for review.`
                  : 'Nothing due — study ahead.'}
            </p>
          </div>
        </div>
      </CourseHeader>

      {/* Curriculum — the ordered path with practice nodes, unlock rules and
          insertion points. */}
      <h2 className="mb-6 font-display text-2xl">Curriculum</h2>
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-soft">This course has no lessons yet.</p>
          <AddLessonControl
            courseId={course.id}
            lessonCount={lessons.length}
            onCreated={(lesson) => navigate(`/course/${courseId}/lesson/${lesson.id}`)}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <InsertGap onInsert={() => setEditorState({ mode: 'new', defaultPosition: undefined })} />
          {nodes.map((node, i) => (
            <PathNodeWithLine
              key={node.id}
              node={node}
              index={i}
              isLast={i === nodes.length - 1}
              lineInsert={lineInserts[i]}
              current={node.id === currentNodeId}
              lockHint={
                node.nodeType === 'lesson'
                  ? lockHintFor(course, node.lesson.id, effectiveDates)
                  : undefined
              }
              lessonDetail={
                node.nodeType === 'lesson' ? detailForLesson(node.lesson.id) : undefined
              }
              onLessonClick={(lessonId) =>
                navigate(`/course/${courseId}/lesson/${lessonId}`)
              }
              onPracticeClick={() => navigate(`/course/${courseId}/learn`)}
              onPracticeEdit={(pn) =>
                pn.practiceNode && setEditorState({ mode: 'edit', node: pn.practiceNode })
              }
              onInsertOnLine={(position) => setEditorState({ mode: 'new', defaultPosition: position })}
            />
          ))}
          <InsertGap
            onInsert={() => setEditorState({ mode: 'new', defaultPosition: lastLessonOrderIndex })}
          />
          <div className="mt-4 flex w-full justify-center">
            <AddLessonControl
              courseId={course.id}
              lessonCount={lessons.length}
              onCreated={(lesson) => navigate(`/course/${courseId}/lesson/${lesson.id}`)}
            />
          </div>
        </div>
      )}

      {editorState && (
        <PracticeNodeEditor
          courseId={course.id}
          lessons={lessons}
          node={editorState.mode === 'edit' ? editorState.node : undefined}
          defaultPosition={editorState.mode === 'new' ? editorState.defaultPosition : undefined}
          onSaved={() => setEditorState(null)}
          onCancel={() => setEditorState(null)}
        />
      )}
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
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="mb-1 h-2.5 w-28 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-20 animate-pulse rounded bg-ink/10" />
          </div>
          <div>
            <div className="mb-1 h-2.5 w-16 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-12 animate-pulse rounded bg-ink/10" />
          </div>
          <div>
            <div className="mb-1 h-2.5 w-16 animate-pulse rounded bg-ink/10" />
            <div className="h-4 w-16 animate-pulse rounded bg-ink/10" />
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
