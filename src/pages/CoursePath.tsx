// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { DelayedFallback } from '../components/ui/DelayedFallback';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { db } from '../db/schema';
import {
  useLessons,
  useCourse,
  useCourseAssessments,
  useCourseCards,
  useCoursePerformance,
  useCourseSummary,
  usePendingMergeReview,
  usePracticeNodes,
} from '../state/useCourseData';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { buildDeckSecondsMap } from '../fsrs/stats';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { MS_PER_DAY } from '../fsrs/params';
import { buildPath, pathPosition, lessonEffectiveReleaseDates } from '../course/path';
import { lessonCardMembership } from '../course/studyPools';
import {
  currentAssessmentPracticeContext,
  type AssessmentPracticeOption,
} from '../course/assessmentPractice';
import { courseHeaderStats } from '../course/headerStats';
import { buildCourseStudyFlowSnapshot, courseMeanReviewSeconds } from '../course/studyFlowSnapshot';
import { planNextStudyStep } from '../course/studyFlowPlanner';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { AssessmentEditorDialog } from '../components/course/AssessmentEditorDialog';
import { AssessmentDetailSheet } from '../components/course/AssessmentDetailSheet';
import { UpcomingAssessmentsStrip } from '../components/course/UpcomingAssessmentsStrip';
import { AddLessonControl } from '../components/course/AddLessonControl';
import { PathNodeWithLine, lockHintFor } from '../components/course/CoursePathSegment';
import { CourseHeader } from '../components/course/CourseHeader';
import { CoursePageNavigation } from '../components/course/CoursePageNavigation';
import { useStudySheet } from '../components/learn/StudySheetContext';
import { LessonViewModeToggle } from '../components/course/LessonViewModeToggle';
import { HeaderStats } from '../components/course/HeaderStats';
import { ArchivedCourseRestoreNotice } from '../components/course/ArchivedCourseState';
import { Button } from '../components/ui/Button';
import { PlayIcon, PlusIcon } from '../components/ui/icons';

import { updateCourse } from '../db/repository';
import {
  canEditLessons,
  isLessonAuthoringMode,
  resolveLessonViewMode,
} from '../course/lessonViewMode';
import { formatDate } from '../utils/datetime';
import { useLessonPathReorder } from '../components/course/useLessonPathReorder';
import { useToast } from '../components/ui/Toast';
import type {
  Card,
  CourseAssessment,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  PracticeMilestone,
  PracticeNode,
} from '../db/types';

const LazyLessonView = lazy(() =>
  import('./LessonView').then((module) => ({ default: module.LessonView })),
);

interface PracticeNodeProgress {
  fraction: number;
  eligibleCount: number;
  completed: boolean;
  scopeVersion: string;
  assessment?: AssessmentPracticeOption;
}

export function CoursePath() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { openStudySheet } = useStudySheet();
  const { notify } = useToast();

  const [practiceEditor, setPracticeEditor] = useState<{
    node?: PracticeNode;
    defaultPosition?: number;
  } | null>(null);
  const [assessmentEditor, setAssessmentEditor] = useState<{
    assessment?: CourseAssessment;
    defaultAfterLessonId?: string | null;
  } | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Use a null-sentinel to distinguish "loading" (undefined) from "not found" (null).
  // When courseId is absent the query resolves immediately to null.
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const assessments = useCourseAssessments(courseId);
  const courseCards = useCourseCards(courseId);
  const summary = useCourseSummary(courseId);
  const practiceNodes = usePracticeNodes(courseId);
  const pendingUpdate = usePendingMergeReview(courseId);
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
  // Per-deck response-time calibration is resolved behind the Course/Lesson
  // boundary and re-scoped into one course-wide mean below.
  const perf = useCoursePerformance(courseId, courseCards);
  const archived = course?.archived === true;
  const lessonViewMode = course ? resolveLessonViewMode(course) : 'study';
  const authoring = course ? !archived && isLessonAuthoringMode(course) : false;
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
  const { reviewDueCount, meanReviewSeconds, nearestPracticeAssessmentDate } = useMemo(() => {
    const currentPractice = course
      ? currentAssessmentPracticeContext({
          course,
          assessments: assessments ?? [],
          lessons: lessons ?? [],
          cards: courseCards ?? [],
          links: lessonLinks ?? [],
          exposures: exposures ?? [],
          now,
        })
      : { scope: [], assessmentOptions: [] };
    const scope = currentPractice.scope;
    const reviewDueCount = dueCards(availableCards(scope, now), now).length;
    const deckSeconds = buildDeckSecondsMap(perf ?? []);
    const meanReviewSeconds = courseMeanReviewSeconds(courseCards ?? [], deckSeconds);
    const nearestPracticeAssessmentDate = currentPractice.assessmentOptions[0]?.examDate;
    return { reviewDueCount, meanReviewSeconds, nearestPracticeAssessmentDate };
    // `now` is deliberately excluded: recomputation is scoped to data changes
    // (cards/perf), not wall-clock drift, and live-query updates re-render anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessments, course, courseCards, exposures, lessonLinks, lessons, perf]);

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
            nearestPracticeAssessmentDate,
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
      nearestPracticeAssessmentDate,
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
            now,
          })
        : null,
    [
      course,
      courseCards,
      examDateContext,
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
        assessment: practice.assessmentOptions[0],
      });
    }
    return result;
  }, [studyFlowSnapshot]);
  const studyTarget =
    studyDecision?.kind === 'step' || studyDecision?.kind === 'choice' ? studyDecision.step : null;
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
    return (
      <DelayedFallback>
        <CoursePathSkeleton />
      </DelayedFallback>
    );
  }

  // Course not found.
  if (course === null || summary === null) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-10">
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <p className="mb-4 text-ink-soft">This course could not be found.</p>
          <Link to="/" className="text-accent underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const lastLesson = lessons[lessons.length - 1];
  const pathEditors = archived ? null : (
    <AnimatePresence>
      {selectedAssessmentId &&
        assessments.find((assessment) => assessment.id === selectedAssessmentId) && (
          <AssessmentDetailSheet
            assessment={assessments.find((assessment) => assessment.id === selectedAssessmentId)!}
            lessons={lessons}
            cards={courseCards}
            links={lessonLinks}
            onClose={() => setSelectedAssessmentId(null)}
            onRevise={() =>
              navigate(
                `/course/${courseId}/study?assessmentId=${encodeURIComponent(selectedAssessmentId)}`,
              )
            }
          />
        )}
      {practiceEditor && (
        <PracticeNodeEditor
          courseId={course.id}
          lessons={lessons}
          node={practiceEditor.node}
          defaultPosition={practiceEditor.defaultPosition}
          onSaved={() => setPracticeEditor(null)}
          onCancel={() => setPracticeEditor(null)}
        />
      )}
      {assessmentEditor && (
        <AssessmentEditorDialog
          courseId={course.id}
          assessment={assessmentEditor.assessment}
          defaultAfterLessonId={assessmentEditor.defaultAfterLessonId}
          lessons={lessons}
          cards={courseCards}
          links={lessonLinks}
          timeZone={course.timeZone}
          onSaved={() => setAssessmentEditor(null)}
          onCancel={() => setAssessmentEditor(null)}
        />
      )}
    </AnimatePresence>
  );

  // Single-lesson branch (addendum E): render the lesson view directly rather than
  // showing a one-item path. No redirect — this is a rendering branch.
  if (lessons.length === 1) {
    return (
      <>
        <Suspense
          fallback={<div className="min-h-[50vh] animate-pulse rounded-2xl bg-ink/[0.03]" />}
        >
          <LazyLessonView
            courseId={courseId}
            lessonId={lessons[0].id}
            showStudyNow={!archived}
            practiceNowEnabled={(studyFlowSnapshot?.recurringPracticeEligibleCount ?? 0) > 0}
            onAddPractice={() => setPracticeEditor({ defaultPosition: lessons[0].orderIndex })}
            onAddCheckpoint={() => setAssessmentEditor({ defaultAfterLessonId: lessons[0].id })}
          />
        </Suspense>
        {pathEditors}
      </>
    );
  }

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
      <CoursePageNavigation
        courseId={courseId ?? ''}
        backTo={archived ? '/archived' : '/'}
        backLabel={archived ? 'Archived courses' : 'All courses'}
        archived={archived}
        className="mb-4"
        trailing={
          archived ? undefined : !canEditLessons(course) ? (
            <span className="hidden text-xs text-ink-faint sm:inline">
              Authoring is locked for shared courses
            </span>
          ) : (
            <LessonViewModeToggle
              mode={lessonViewMode}
              onChange={(mode) => void updateCourse(course.id, { lessonViewMode: mode })}
            />
          )
        }
      />

      {/* A single upcoming assessment is already named by the card's eyebrow and counted
          by its days-to-go pill, so the strip would be a third copy of one date. It earns
          its row only when there is a choice of assessment to select between. */}
      {!archived && assessments.length > 1 && (
        <UpcomingAssessmentsStrip
          assessments={assessments}
          now={now}
          onSelect={setSelectedAssessmentId}
          className="mb-3"
        />
      )}

      {/* Header — title, a row of labelled stat pills (HeaderStats), and the
          Study action. */}
      <CourseHeader
        className="mb-12"
        eyebrow={
          nearestExam === undefined
            ? 'Steady retention'
            : `Exam ${formatDate(nearestExam, course.timeZone)}`
        }
        examUrgent={examUrgent}
        title={course.name}
        onRename={
          authoring
            ? async (name) => {
                try {
                  await updateCourse(course.id, { name });
                } catch (error) {
                  notify(
                    error instanceof Error ? error.message : 'Could not rename the course.',
                    'negative',
                  );
                  throw error;
                }
              }
            : undefined
        }
        renameLabel="course"
      >
        <div className="min-w-0 max-w-full">
          <HeaderStats
            dueCount={dueCardCount}
            masteryPct={masteryPct}
            daysToExam={
              nearestExam === undefined
                ? undefined
                : Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0)
            }
            totalCards={courseCards.length}
            unseenCount={unseenCount}
            lessonProgress={{ reached, total }}
          />
          {archived ? (
            <ArchivedCourseRestoreNotice />
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                variant="primary"
                size="lg"
                disabled={!studyTarget}
                onClick={() => {
                  if (!studyTarget) return;
                  // Raises the study sheet rather than navigating: the choice is one tap
                  // to open and one to dismiss, and dismissing leaves this page in place.
                  openStudySheet(courseId);
                }}
              >
                <PlayIcon width={18} height={18} />
                Study
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={(studyFlowSnapshot?.recurringPracticeEligibleCount ?? 0) === 0}
                onClick={() => navigate(`/course/${courseId}/study?review=due`)}
              >
                Practice Now
              </Button>
              {pendingUpdate && (
                <Link
                  to={`/course/${courseId}/updates`}
                  className="inline-flex min-h-11 items-center rounded-full bg-accent-soft px-3.5 text-sm font-medium text-accent transition-colors hover:brightness-95"
                >
                  Review updates
                </Link>
              )}
              {/* The due count already leads the stat pills above, so this line
                  only speaks when there is something the pills don't say. */}
              {(courseCards.length === 0 || dueCardCount === 0) && (
                <p className="text-sm text-ink-faint">
                  {courseCards.length === 0
                    ? 'Add cards to begin studying.'
                    : 'Nothing due — next lesson available.'}
                </p>
              )}
            </div>
          )}
          {/* Quiet pointer to where Study will draw from — the "you are here"
              lesson (currentLessonNode), reusing the same node the path
              highlights below rather than recomputing it. */}
          {!archived && nextStudyLabel && (
            <p className="mt-1.5 break-words text-xs text-ink-faint">Next: {nextStudyLabel}</p>
          )}
        </div>
      </CourseHeader>

      {/* Curriculum — the ordered path with practice nodes, unlock rules and
          insertion points. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Curriculum</h2>
        {authoring && (
          <div
            role="group"
            aria-label="Add to path"
            className="flex flex-wrap items-center justify-end gap-2"
          >
            <AddLessonControl
              courseId={course.id}
              lessonCount={lessons.length}
              onCreated={(lesson) => navigate(`/course/${courseId}/lesson/${lesson.id}`)}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPracticeEditor({ defaultPosition: lastLesson?.orderIndex })}
            >
              <PlusIcon width={16} height={16} />
              Add practice
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAssessmentEditor({ defaultAfterLessonId: lastLesson?.id ?? null })}
            >
              <PlusIcon width={16} height={16} />
              Add checkpoint
            </Button>
          </div>
        )}
      </div>
      <p id="lesson-path-reorder-instructions" className="sr-only">
        In Author mode, hold this lesson and drag it to reorder. Alternatively, press Alt and the up
        or down arrow key.
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {lessonReorder.announcement}
      </div>
      {visibleNodes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-strong py-16 text-center">
          <p className="text-sm text-ink-soft">This course has no lessons yet.</p>
          {authoring && (
            <p className="text-xs text-ink-faint">Use the path actions above to begin.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          {visibleNodes.map((node, i) => (
            <PathNodeWithLine
              key={node.id}
              node={node}
              isLast={i === visibleNodes.length - 1}
              current={!archived && node.id === currentNodeId}
              lockHint={
                node.nodeType === 'lesson'
                  ? lockHintFor(course, node.lesson.id, effectiveDates)
                  : undefined
              }
              lessonDetail={
                node.nodeType === 'lesson' ? detailForLesson(node.lesson.id) : undefined
              }
              onLessonClick={(lessonId) => navigate(`/course/${courseId}/lesson/${lessonId}`)}
              archivedInspection={archived}
              practiceProgress={
                node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual'
                  ? practiceProgressByKey.get(node.nodeKey)
                  : undefined
              }
              practiceAssessment={
                node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual'
                  ? practiceProgressByKey.get(node.nodeKey)?.assessment
                  : undefined
              }
              onPracticeClick={
                archived
                  ? undefined
                  : (practiceNode) =>
                      navigate(
                        `/course/${courseId}/study?practiceNode=${encodeURIComponent(practiceNode.nodeKey)}`,
                      )
              }
              onPracticeAssessmentClick={
                archived
                  ? undefined
                  : (assessmentId) =>
                      navigate(
                        `/course/${courseId}/study?assessmentId=${encodeURIComponent(assessmentId)}`,
                      )
              }
              onCheckpointClick={
                archived
                  ? undefined
                  : (assessmentId) => {
                      const assessment = assessments.find((item) => item.id === assessmentId);
                      if (!assessment) return;
                      if (authoring) {
                        setAssessmentEditor({ assessment });
                      } else {
                        setSelectedAssessmentId(assessmentId);
                      }
                    }
              }
              onPracticeEdit={
                authoring
                  ? (pn) => pn.practiceNode && setPracticeEditor({ node: pn.practiceNode })
                  : undefined
              }
              authoring={authoring}
              lessonReorder={
                !archived && node.nodeType === 'lesson'
                  ? lessonReorder.interactionFor(node.lesson.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {pathEditors}
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
