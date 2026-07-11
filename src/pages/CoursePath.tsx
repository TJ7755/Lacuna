// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { useState } from 'react';
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
import { availableCards, dueCards } from '../fsrs/eligibility';
import { DEFAULT_REVIEW_SECONDS } from '../fsrs/stats';
import { progressDescription } from '../fsrs/objective';
import { MS_PER_DAY } from '../fsrs/params';
import { buildPath, pathPosition, nearestExamDate } from '../course/path';
import type { PathNode, PracticePathNode } from '../course/path';
import { PathNodeView } from '../components/course/PathNodeView';
import { PathLine } from '../components/course/PathLine';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { AddLessonControl } from '../components/course/AddLessonControl';
import { CourseHeader } from '../components/course/CourseHeader';
import { CourseHeaderStat } from '../components/course/CourseHeaderStat';
import { MasteryRing } from '../components/course/MasteryRing';
import { LessonView } from './LessonView';
import {
  ChartIcon,
  ChevronLeftIcon,
  ClockIcon,
  PathIcon,
  PlusIcon,
  SettingsIcon,
} from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { formatDate } from '../utils/datetime';
import type { Card, Course, PracticeNode } from '../db/types';

/** An exam within this many days is flagged as urgent (pulsing header marker). */
const EXAM_URGENT_DAYS = 3;

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
  const summaries = useCourseSummaries();
  const practiceNodes = usePracticeNodes(courseId);
  // Per-deck response-time calibration for the decks backing this course's cards,
  // re-scoped into a single course-wide mean (see courseMeanReviewSeconds above).
  const deckIds = courseCards ? Array.from(new Set(courseCards.map((c) => c.deckId))) : [];
  const perf = useLiveQuery(
    () => (deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : []),
    [deckIds.join(',')],
  );

  // Loading state — a skeleton while course/lesson data resolves.
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
  const dueCardCount = dueCards(availableCards(courseCards, now), now).length;
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

  // Precomputed for the manual practice-node insertion affordances (see InsertGap/
  // InsertButton below): which lines on the path may host a "+", and the position
  // value ("end of course") the trailing insertion point should seed a new node with.
  const lineInserts = computeLineInserts(nodes);
  const lastLessonOrderIndex = lessons.reduce<number | undefined>(
    (max, l) => (max === undefined || l.orderIndex > max ? l.orderIndex : max),
    undefined,
  );

  // Curriculum position (addendum J): counts non-extension lessons reached.
  // This is pacing — it has nothing to do with mastery or FSRS retention.
  const { reached, total } = pathPosition(nodes);

  // Mastery: FSRS-derived mean predicted retention across the card pool,
  // expressed as a percentage. Distinct from path position.
  const masteryPct = summary ? Math.round(summary.mastery * 100) : 0;

  // Nearest upcoming exam date: consider course.examDate and all explicit exam dates;
  // show the soonest one that is still in the future.
  const nearestExam = nearestExamDate(course, examDates, now);
  const examUrgent = nearestExam > now && nearestExam - now <= EXAM_URGENT_DAYS * MS_PER_DAY;

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

      {/* Header */}
      <CourseHeader
        className="mb-10"
        eyebrow={`Exam ${formatDate(nearestExam, course.timeZone)}`}
        examUrgent={examUrgent}
        title={course.name}
      >
        {/*
         * Curriculum position: how many lessons the student has reached. This is
         * a pacing metric — SEPARATE from mastery, hence the distinct icon and
         * one-line descriptor below.
         */}
        <CourseHeaderStat
          icon={<PathIcon width={18} height={18} />}
          label="Curriculum position"
          value={`Lesson ${reached} of ${total}`}
          description="How far you've worked through the course."
        />
        {/*
         * Mastery: mean predicted FSRS retention across the card pool. A
         * different metric from curriculum position — see the ring, not a bar,
         * so it reads as its own instrument.
         */}
        <CourseHeaderStat
          icon={<MasteryRing value={summary?.mastery ?? 0} />}
          label="Mastery"
          value={`${masteryPct}%`}
          description={progressDescription(course)}
        />
        {/* Due today: cards a session would serve right now, course-wide. */}
        <CourseHeaderStat
          icon={<ClockIcon width={18} height={18} />}
          label="Due today"
          value={`${dueCardCount} card${dueCardCount === 1 ? '' : 's'}`}
          description="Ready for review right now."
        />
      </CourseHeader>

      {/* Course path */}
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
              isLast={i === nodes.length - 1}
              lineInsert={lineInserts[i]}
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

/** Whether the line/gap right after `nodes[i]` should offer a practice-node insertion point. */
interface LineInsert {
  insertable: boolean;
  position?: number;
}

/**
 * Precomputes, for the line following each node, whether inserting a manual
 * practice node there is meaningful and which `position` it should carry.
 *
 * A gap is only ever meaningful at a lesson boundary (manual placement keys off
 * lesson `orderIndex`, see buildPath/practiceGateAfterLesson), so this only marks
 * the line immediately preceding the *next* lesson node as insertable — even when
 * several checkpoint/practice nodes sit between two lessons, only one insertion
 * point renders for that whole stretch.
 */
function computeLineInserts(nodes: PathNode[]): LineInsert[] {
  const result: LineInsert[] = [];
  let lastLessonOrder: number | undefined;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 'lesson') lastLessonOrder = node.lesson.orderIndex;
    const next = nodes[i + 1];
    result.push(
      next && next.nodeType === 'lesson'
        ? { insertable: true, position: lastLessonOrder }
        : { insertable: false },
    );
  }
  return result;
}

/**
 * Renders a single path node followed by its connecting line (if not the last node).
 * The connecting line is accent-tinted when the preceding node is a completed lesson,
 * indicating the student has already cleared that stretch of the path. When
 * `lineInsert.insertable`, the line also carries a hover-revealed "+" affordance for
 * inserting a manual practice node at that gap.
 */
function PathNodeWithLine({
  node,
  isLast,
  lineInsert,
  onLessonClick,
  onPracticeClick,
  onPracticeEdit,
  onInsertOnLine,
}: {
  node: PathNode;
  isLast: boolean;
  lineInsert: LineInsert;
  onLessonClick: (lessonId: string) => void;
  onPracticeClick: () => void;
  onPracticeEdit: (node: PracticePathNode) => void;
  onInsertOnLine: (position: number | undefined) => void;
}) {
  // A segment is completed when the node it trails is a completed lesson.
  // Checkpoints and available/locked lessons leave the segment neutral.
  const segmentCompleted =
    !isLast && node.nodeType === 'lesson' && node.status === 'completed';

  return (
    <div className="flex flex-col items-center">
      <PathNodeView
        node={node}
        onLessonClick={onLessonClick}
        onPracticeClick={onPracticeClick}
        onPracticeEdit={onPracticeEdit}
      />
      {!isLast && (
        <div className="relative">
          <PathLine completed={segmentCompleted} />
          {lineInsert.insertable && (
            <InsertButton onInsert={() => onInsertOnLine(lineInsert.position)} />
          )}
        </div>
      )}
    </div>
  );
}

/** A hover-revealed "+" for inserting a manual practice node at a specific path gap. */
function InsertButton({ onInsert }: { onInsert: () => void }) {
  return (
    <button
      type="button"
      onClick={onInsert}
      aria-label="Insert practice node here"
      className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface text-ink-faint opacity-0 transition-opacity duration-150 hover:opacity-100 hover:border-accent hover:text-accent focus-visible:opacity-100 focus-visible:outline-none"
    >
      <PlusIcon width={12} height={12} />
    </button>
  );
}

/** The start/end insertion points, where there is no existing connecting line to anchor to. */
function InsertGap({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="relative h-8 w-1">
      <InsertButton onInsert={onInsert} />
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
