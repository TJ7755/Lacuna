// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'motion/react';
import { db } from '../db/schema';
import {
  useLessons,
  useCourse,
  useCourseAssessments,
  useCourseCards,
  useCourseSummary,
  usePracticeNodes,
} from '../state/useCourseData';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { buildDeckSecondsMap } from '../fsrs/stats';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { MS_PER_DAY } from '../fsrs/params';
import {
  buildPath,
  pathPosition,
  lessonEffectiveReleaseDates,
  nearestExamDate,
} from '../course/path';
import { lessonCardMembership } from '../course/studyPools';
import { courseHeaderStats } from '../course/headerStats';
import { buildCourseStudyFlowSnapshot, courseMeanReviewSeconds } from '../course/studyFlowSnapshot';
import { planNextStudyStep } from '../course/studyFlowPlanner';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { AddLessonControl } from '../components/course/AddLessonControl';
import {
  PathNodeWithLine,
  InsertGap,
  computeLineInserts,
  lockHintFor,
} from '../components/course/CoursePathSegment';
import { CourseHeader } from '../components/course/CourseHeader';
import { LessonViewModeToggle } from '../components/course/LessonViewModeToggle';
import { HeaderStats } from '../components/course/HeaderStats';
import { LessonView } from './LessonView';
import { Button } from '../components/ui/Button';
import { ChartIcon, ChevronLeftIcon, PlayIcon, SettingsIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { updateCourse } from '../db/repository';
import { isLessonAuthoringMode, resolveLessonViewMode } from '../course/lessonViewMode';
import { formatDate } from '../utils/datetime';
import { useLessonPathReorder } from '../components/course/useLessonPathReorder';
import { useToast } from '../components/ui/Toast';
import type {
  Card,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  PracticeMilestone,
  PracticeNode,
} from '../db/types';

interface PracticeNodeProgress {
  fraction: number;
  eligibleCount: number;
  completed: boolean;
  scopeVersion: string;
}

export function CoursePath() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
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
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const assessments = useCourseAssessments(courseId);
  const courseCards = useCourseCards(courseId);
  const summary = useCourseSummary(courseId);
  const practiceNodes = usePracticeNodes(courseId);
  const lessonIds = useMemo(() => (lessons ?? []).map((lesson) => lesson.id), [lessons]);
  const lessonIdsKey = lessonIds.join(',');
  const lessonLinks = useLiveQuery<LessonCardLink[]>(
    () => (lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : []),
    [lessonIdsKey],
  );
  const exposures = useLiveQuery<LessonCardExposure[]>(
    () =>
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
    [lessonIdsKey],
  );
  const lessonCompletions = useLiveQuery<LessonCompletion[]>(
    () =>
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
    [lessonIdsKey],
  );
  const practiceMilestones = useLiveQuery<PracticeMilestone[]>(
    () => (courseId ? db.practiceMilestones.where('courseId').equals(courseId).toArray() : []),
    [courseId],
  );
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
  const lessonViewMode = course ? resolveLessonViewMode(course) : 'study';
  const authoring = course ? isLessonAuthoringMode(course) : false;
  const notifyReorderError = useCallback(
    (message: string) => notify(message, 'negative'),
    [notify],
  );
  const lessonReorder = useLessonPathReorder({
    courseId: courseId ?? '',
    lessons: lessons ?? [],
    enabled: authoring,
    onError: notifyReorderError,
  });

  const dataLoaded =
    course !== undefined &&
    lessons !== undefined &&
    assessments !== undefined &&
    courseCards !== undefined &&
    summary !== undefined &&
    practiceNodes !== undefined &&
    lessonLinks !== undefined &&
    exposures !== undefined &&
    lessonCompletions !== undefined &&
    practiceMilestones !== undefined &&
    perf !== undefined;

  // Complete lesson membership includes both primary and explicitly linked cards.
  // Hooks below must run unconditionally (Rules of Hooks), so they tolerate
  // not-yet-loaded data via fallbacks and are only consumed once `dataLoaded`.
  const lessonCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const lesson of lessons ?? []) {
      map.set(lesson.id, lessonCardMembership(lesson.id, courseCards ?? [], lessonLinks ?? []));
    }
    return map;
  }, [courseCards, lessonLinks, lessons]);

  // Live review-due count and mean review time, feeding shouldInsertPractice
  // (addendum 2 §H). Deliberately review-only (dueCards): practice-node pacing
  // is about FSRS review pressure, unlike the header's dueCardCount which also
  // admits new cards (see courseHeaderStats).
  const now = Date.now();
  const { reviewDueCount, meanReviewSeconds } = useMemo(() => {
    const reviewDueCount = dueCards(availableCards(courseCards ?? [], now), now).length;
    const deckSeconds = buildDeckSecondsMap(perf ?? []);
    const meanReviewSeconds = courseMeanReviewSeconds(courseCards ?? [], deckSeconds);
    return { reviewDueCount, meanReviewSeconds };
    // `now` is deliberately excluded: recomputation is scoped to data changes
    // (cards/perf), not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseCards, perf]);

  const nodes = useMemo(
    () =>
      course && lessons && assessments && practiceNodes
        ? buildPath(
            course,
            lessons,
            assessments,
            lessonCardsById,
            practiceNodes,
            reviewDueCount,
            meanReviewSeconds,
            now,
            {
              exposures: exposures ?? [],
              lessonCompletions: lessonCompletions ?? [],
              practiceMilestones: practiceMilestones ?? [],
            },
          )
        : [],
    // `now` is deliberately excluded: recomputation is scoped to data changes,
    // not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      course,
      lessons,
      assessments,
      lessonCardsById,
      practiceNodes,
      reviewDueCount,
      meanReviewSeconds,
      exposures,
      lessonCompletions,
      practiceMilestones,
    ],
  );

  const examDateContext = useMemo(
    () =>
      course && lessons && assessments
        ? makeExamDateContext(course, lessons, assessments)
        : undefined,
    [course, lessons, assessments],
  );

  const studyFlowSnapshot = useMemo(
    () =>
      course && examDateContext
        ? buildCourseStudyFlowSnapshot({
            course,
            nodes,
            cards: courseCards ?? [],
            links: lessonLinks ?? [],
            exposures: exposures ?? [],
            examDateContext,
            meanReviewSeconds,
            practiceMilestones: practiceMilestones ?? [],
            nearestExamDate: nearestExamDate(course, assessments ?? [], now),
            now,
          })
        : null,
    [
      course,
      courseCards,
      examDateContext,
      assessments,
      exposures,
      lessonLinks,
      meanReviewSeconds,
      nodes,
      practiceMilestones,
      now,
    ],
  );
  const studyDecision = useMemo(
    () => (studyFlowSnapshot ? planNextStudyStep(studyFlowSnapshot) : null),
    [studyFlowSnapshot],
  );
  const practiceProgressByKey = useMemo(() => {
    const result = new Map<string, PracticeNodeProgress>();
    for (const practice of studyFlowSnapshot?.practiceByKey.values() ?? []) {
      result.set(practice.nodeKey, {
        fraction: practice.totalCount > 0 ? practice.securedCount / practice.totalCount : 0,
        eligibleCount: practice.eligibleCount,
        completed: practice.completed,
        scopeVersion: practice.scopeVersion,
      });
    }
    return result;
  }, [studyFlowSnapshot]);
  const studyTarget = studyDecision?.kind === 'step' ? studyDecision.step : null;
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (node.nodeType === 'practice-auto') return false;
        if (node.nodeType !== 'practice-manual') return true;
        const practice = studyFlowSnapshot?.practiceByKey.get(node.nodeKey);
        return authoring || practice?.active === true || practice?.completed === true;
      }),
    [authoring, nodes, studyFlowSnapshot],
  );

  // Loading state — a skeleton while course/lesson data resolves.
  if (!dataLoaded) {
    return <CoursePathSkeleton />;
  }

  // Course not found.
  if (course === null || summary === null) {
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
    return <LessonView courseId={courseId} lessonId={lessons[0].id} showStudyNow />;
  }

  // Precomputed for the manual practice-node insertion affordances (see InsertGap/
  // InsertButton below): which lines on the path may host a "+", and the position
  // value ("end of course") the trailing insertion point should seed a new node with.
  const lineInserts = computeLineInserts(visibleNodes);
  // Release-date map for the "locked" hint (see lockHintFor below) — only
  // consulted under `linear` unlock mode.
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);
  // The single next-up lesson gets the "you are here" halo (see LessonNode):
  // the first lesson node on the path still in 'available' status.
  const currentLessonNode = visibleNodes.find(
    (n) => n.nodeType === 'lesson' && n.status === 'available',
  );
  const currentNodeId = currentLessonNode?.id;
  const nextStudyLabel = studyTarget?.label;
  const lastLessonOrderIndex = lessons[lessons.length - 1]?.orderIndex;

  // Curriculum position (addendum J): counts non-extension lessons reached.
  // This is pacing — it has nothing to do with mastery or FSRS retention.
  const { reached, total } = pathPosition(visibleNodes);

  // Header stats: nearest exam + urgency + dueCardCount use the same maths as
  // LessonView's (see courseHeaderStats — due here means overdue reviews plus
  // admissible new cards, matching what Study serves); mastery is passed in
  // from the course-level summary (extension-lesson cards already excluded
  // there).
  const { nearestExam, examUrgent, mastery, dueCardCount } = courseHeaderStats(
    course,
    assessments,
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
      masteryPct: Math.round(progressValue(cards, course, now, examDateContext) * 100),
    };
  };
  const unseenCount = courseCards.filter((c) => c.lastReviewed === null || c.state === 0).length;

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
        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start sm:gap-4">
          <Link
            to={`/course/${courseId}/bank`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
          >
            Question bank
          </Link>
          <LessonViewModeToggle
            mode={lessonViewMode}
            onChange={(mode) => void updateCourse(course.id, { lessonViewMode: mode })}
          />
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

      {/* Header — title, a row of labelled stat pills (HeaderStats), and the
          Study action. */}
      <CourseHeader
        className="mb-12"
        eyebrow={`Exam ${formatDate(nearestExam, course.timeZone)}`}
        examUrgent={examUrgent}
        title={course.name}
      >
        <div className="min-w-0 max-w-full">
          <HeaderStats
            dueCount={dueCardCount}
            masteryPct={masteryPct}
            daysToExam={Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0)}
            totalCards={courseCards.length}
            unseenCount={unseenCount}
            lessonProgress={{ reached, total }}
          />
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              size="lg"
              disabled={!studyTarget}
              onClick={() => {
                if (!studyTarget) return;
                navigate(`/course/${courseId}/study`);
              }}
            >
              <PlayIcon width={18} height={18} />
              Study now
            </Button>
            {(studyFlowSnapshot?.recurringPracticeEligibleCount ?? 0) > 0 && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate(`/course/${courseId}/study?review=due`)}
              >
                Review due cards
              </Button>
            )}
            {/* The due count already leads the stat pills above, so this line
                only speaks when there is something the pills don't say. */}
            {(courseCards.length === 0 || dueCardCount === 0) && (
              <p className="text-sm text-ink-faint">
                {courseCards.length === 0
                  ? 'Add cards to begin studying.'
                  : 'Nothing due — study ahead.'}
              </p>
            )}
          </div>
          {/* Quiet pointer to where Study will draw from — the "you are here"
              lesson (currentLessonNode), reusing the same node the path
              highlights below rather than recomputing it. */}
          {nextStudyLabel && (
            <p className="mt-1.5 break-words text-xs text-ink-faint">Next: {nextStudyLabel}</p>
          )}
        </div>
      </CourseHeader>

      {/* Curriculum — the ordered path with practice nodes, unlock rules and
          insertion points. */}
      <h2 className="mb-6 font-display text-2xl">Curriculum</h2>
      <p id="lesson-path-reorder-instructions" className="sr-only">
        In Edit mode, hold this lesson and drag it to reorder. Alternatively, press Alt and the up
        or down arrow key.
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {lessonReorder.announcement}
      </div>
      {visibleNodes.length === 0 ? (
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
          {visibleNodes.map((node, i) => (
            <PathNodeWithLine
              key={node.id}
              node={node}
              index={i}
              isLast={i === visibleNodes.length - 1}
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
              onLessonClick={(lessonId) => navigate(`/course/${courseId}/lesson/${lessonId}`)}
              practiceProgress={
                node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual'
                  ? practiceProgressByKey.get(node.nodeKey)
                  : undefined
              }
              onPracticeClick={(practiceNode) =>
                navigate(
                  `/course/${courseId}/study?practiceNode=${encodeURIComponent(practiceNode.nodeKey)}`,
                )
              }
              onPracticeEdit={(pn) =>
                pn.practiceNode && setEditorState({ mode: 'edit', node: pn.practiceNode })
              }
              onInsertOnLine={(position) =>
                setEditorState({ mode: 'new', defaultPosition: position })
              }
              authoring={authoring}
              lessonReorder={
                node.nodeType === 'lesson'
                  ? lessonReorder.interactionFor(node.lesson.id)
                  : undefined
              }
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

      <AnimatePresence>
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
      </AnimatePresence>
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
