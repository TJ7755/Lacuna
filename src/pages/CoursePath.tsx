// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { usePendingMergeReview } from '../state/useCourseData';
import { useCourseStudyFlowRecords } from '../state/useCourseStudyFlowRecords';
import { computeCourseSummaries } from '../state/courseSummaries';
import { availableCards, dueCards } from '../fsrs/eligibility';
import { buildDeckSecondsMap } from '../fsrs/stats';
import { progressValue } from '../fsrs/objective';
import { makeExamDateContext } from '../fsrs/examDate';
import { buildPath, pathPosition, lessonEffectiveReleaseDates } from '../course/path';
import { lessonCardMembership } from '../course/studyPools';
import {
  currentAssessmentPracticeContext,
  type AssessmentPracticeOption,
} from '../course/assessmentPractice';
import { courseHeaderStats } from '../course/headerStats';
import { buildCourseStudyFlowSnapshot, courseMeanReviewSeconds } from '../course/studyFlowSnapshot';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { QuestionSetPathEditor } from '../components/course/QuestionSetPathEditor';
import { AssessmentEditorDialog } from '../components/course/AssessmentEditorDialog';
import { AssessmentDetailSheet } from '../components/course/AssessmentDetailSheet';
import { lockHintFor } from '../components/course/CoursePathSegment';
import { CourseHeader } from '../components/course/CourseHeader';
import { useStudySheet } from '../components/learn/StudySheetContext';
import { HeaderStats } from '../components/course/HeaderStats';
import { MS_PER_DAY } from '../fsrs/params';
import { CoursePathSkeleton } from '../components/course/CoursePathSkeleton';
import { CourseOverview } from '../components/course/CourseOverview';
import { ArchivedCourseRestoreNotice } from '../components/course/ArchivedCourseState';
import { Button } from '../components/ui/Button';
import { PlayIcon } from '../components/ui/icons';

import { updateCourse } from '../db/courseRepository';
import { isLessonAuthoringMode } from '../course/lessonViewMode';
import { useLessonPathReorder } from '../components/course/useLessonPathReorder';
import { useToast } from '../components/ui/Toast';
import type { Card, CourseAssessment, PracticeNode } from '../db/types';
import { Skeleton } from '../components/ui/Skeleton';

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
  const [addingQuestionSet, setAddingQuestionSet] = useState(false);
  const [assessmentEditor, setAssessmentEditor] = useState<{
    assessment?: CourseAssessment;
    defaultAfterLessonId?: string | null;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAssessmentId = searchParams.get('exam');
  const setSelectedAssessmentId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('exam', id);
    else next.delete('exam');
    setSearchParams(next, { replace: true });
  };

  const records = useCourseStudyFlowRecords(courseId);
  const course = records?.course;
  const lessons = records?.lessons;
  const courseCards = records?.cards;
  // Match the existing Dexie sort: an undated assessment keeps its relative position.
  const assessments = useMemo(
    () => records?.assessments.slice().sort((a, b) => (a.examDate ?? NaN) - (b.examDate ?? NaN)),
    [records],
  );
  const practiceNodes = records?.practiceNodes;
  const lessonLinks = records?.links;
  const exposures = records?.exposures;
  const lessonCompletions = records?.completions;
  const practiceMilestones = records?.milestones;
  const perf = records?.performance;
  const summary = useMemo(() => {
    if (!records) return undefined;
    if (!records.course) return null;
    return computeCourseSummaries(
      [records.course],
      records.lessons,
      records.cards,
      records.assessments,
    )[records.course.id];
  }, [records]);
  const pendingUpdate = usePendingMergeReview(courseId);
  const archived = course?.archived === true;
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
  // is about FSRS review pressure, so it ignores mastery, unlike the header's
  // due count (see courseDueReviewCards).
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
            onClose={() => {
              setSelectedAssessmentId(null);
            }}
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
  // showing a one-item path. A question-set activity makes this a multi-step path.
  // No redirect — this is a rendering branch. The
  // course header (and its review entry point) is bypassed here, so a pending
  // merge review gets the same entry above the lesson.
  if (lessons.length === 1 && !nodes.some((node) => node.nodeType === 'practice-question-set')) {
    return (
      <>
        {!archived && pendingUpdate && (
          <div className="mx-auto mb-4 max-w-3xl px-6 md:px-10">
            <Link
              to={`/course/${courseId}/updates`}
              className="inline-flex min-h-11 items-center rounded-lg bg-accent-soft px-3.5 text-sm font-medium text-accent transition-colors hover:brightness-95"
            >
              Review updates
            </Link>
          </div>
        )}
        <Suspense
          fallback={<Skeleton className="min-h-[50vh] rounded-2xl bg-ink/[0.03]" />}
        >
          <LazyLessonView
            courseId={courseId}
            lessonId={lessons[0].id}
            showStudyNow={!archived}
            onStudy={() => openStudySheet(courseId)}
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
  // Course position (addendum J): counts non-extension lessons reached.
  // This is pacing — it has nothing to do with mastery or FSRS retention.
  const { reached, total } = pathPosition(visibleNodes);

  // Header stats: nearest exam + urgency use the same maths as LessonView's
  // (see courseHeaderStats); mastery is passed in from the course-level summary
  // (extension-lesson cards already excluded there). The due count is the
  // snapshot's, so it matches the Review due cards session it opens.
  const { nearestExam, mastery } = courseHeaderStats(
    course,
    assessments,
    summary?.mastery ?? 0,
    now,
  );
  const dueReviewCardIds = studyFlowSnapshot?.dueReviewCardIds;
  const dueCardCount = dueReviewCardIds?.size ?? 0;
  const masteryPct = Math.round(mastery * 100);

  // Selected lesson detail includes linked cards, due reviews and mastery.
  const detailForLesson = (lessonId: string) => {
    const cards = lessonCardsById.get(lessonId) ?? [];
    return {
      cardCount: cards.length,
      dueCount: cards.filter((card) => dueReviewCardIds?.has(card.id)).length,
      masteryPct: Math.round(progressValue(cards, course, now, examDateContext) * 100),
    };
  };
  return (
    <div className={`${COURSE_PAGE_FRAME} course-overview`}>
      <CourseHeader
        className="course-overview-header"
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
        <div className="course-header-actions">
          <HeaderStats
            compact
            dueCount={dueCardCount}
            masteryPct={masteryPct}
            daysToExam={
              nearestExam === undefined
                ? undefined
                : Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0)
            }
            totalCards={courseCards.length}
            unseenCount={
              courseCards.filter((card) => card.lastReviewed === null || card.state === 0).length
            }
            lessonProgress={{ reached, total }}
          />
          {!archived && (
            <div className="course-study-actions">
              <Button variant="primary" onClick={() => openStudySheet(courseId)}>
                <PlayIcon width={18} height={18} />
                Study
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={dueCardCount === 0}
                onClick={() => navigate(`/course/${courseId}/study?review=due`)}
              >
                Review due cards
              </Button>
            </div>
          )}
        </div>
      </CourseHeader>
      <div className="course-progress-row">
        <span>
          {reached} / {total} lessons reached
        </span>
        {!archived && pendingUpdate && (
          <Link to={`/course/${courseId}/updates`} className="text-accent underline">
            Review updates
          </Link>
        )}
      </div>
      {archived && <ArchivedCourseRestoreNotice />}
      <CourseOverview
        courseId={course.id}
        nodes={visibleNodes}
        lessonCount={lessons.length}
        assessments={assessments}
        timeZone={course.timeZone}
        authoring={authoring}
        archived={archived}
        announcement={lessonReorder.announcement}
        reorderFor={lessonReorder.interactionFor}
        detailForLesson={detailForLesson}
        lockHint={(id) => lockHintFor(course, id, effectiveDates)}
        practiceProgress={practiceProgressByKey}
        onLessonOpen={(id) => navigate(`/course/${courseId}/lesson/${id}`)}
        onLessonCreated={(lesson) => navigate(`/course/${courseId}/lesson/${lesson.id}`)}
        onPracticeOpen={(node) =>
          navigate(`/course/${courseId}/study?practiceNode=${encodeURIComponent(node.nodeKey)}`)
        }
        onPracticeEdit={(node) =>
          node.practiceNode && setPracticeEditor({ node: node.practiceNode })
        }
        onAssessmentPractise={(id) =>
          navigate(`/course/${courseId}/study?assessmentId=${encodeURIComponent(id)}`)
        }
        onAssessmentOpen={(id) => {
          const assessment = assessments.find((item) => item.id === id);
          if (!assessment || archived) return;
          if (authoring) setAssessmentEditor({ assessment });
          else setSelectedAssessmentId(id);
        }}
        onAdd={(kind) => {
          if (kind === 'practice') setPracticeEditor({ defaultPosition: lastLesson?.orderIndex });
          else if (kind === 'question-set') setAddingQuestionSet(true);
          else setAssessmentEditor({ defaultAfterLessonId: lastLesson?.id ?? null });
        }}
      />
      {pathEditors}
      {addingQuestionSet && lastLesson && (
        <QuestionSetPathEditor
          courseId={course.id}
          afterLessonId={lastLesson.id}
          onClose={() => setAddingQuestionSet(false)}
        />
      )}
    </div>
  );
}
