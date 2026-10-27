import { courseLessonOrderPreference, resolveCourseLessonOrder } from '../course/lessonOrder';
import { isLearnerOwnedCheckpoint } from '../course/assessmentOwnership';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { MissingRecord } from '../components/course/MissingRecord';
import { localLessonOrderUnavailableReason } from '../course/lessonOrder';
// Course path page — renders the ordered sequence of lessons for a course.
// Route: /course/:courseId
// British English throughout.

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { AnimatePresence } from 'motion/react';
import { usePendingMergeReview } from '../state/useCourseData';
import { useCourseForecast } from '../state/ShellCourseData';
import { useCoursePathRecords } from '../state/useCourseStudyFlowRecords';
import { progressValue } from '../fsrs/objective';
import { lessonEffectiveReleaseDates } from '../course/path';
import { courseHeaderStats } from '../course/headerStats';
import { PracticeNodeEditor } from '../components/course/PracticeNodeEditor';
import { QuestionSetPathEditor } from '../components/course/QuestionSetPathEditor';
import { AssessmentPathEditor } from '../components/course/AssessmentPathEditor';
import { AssessmentDetailSheet } from '../components/course/AssessmentDetailSheet';
import { lockHintFor } from '../components/course/lockHint';
import { CourseHeader } from '../components/course/CourseHeader';
import { useStudySheet } from '../components/learn/StudySheetContext';
import { CourseOverview } from '../components/course/CourseOverview';
import { useCoursePathData } from '../components/course/useCoursePathData';
import { ArchivedCourseRestoreNotice } from '../components/course/ArchivedCourseState';
import { CourseStudyActions } from '../components/course/CourseStudyActions';
import { CourseSummaryCard } from '../components/course/CourseSummaryCard';
import { forecastStatus } from '../components/dashboard/forecastStatus';
import { formatShortDate, startOfDay } from '../utils/datetime';

import { updateCourse } from '../db/courseRepository';
import { useCoursePathReorder } from '../components/course/useCoursePathReorder';
import { useToast } from '../components/ui/Toast';
import type { CourseAssessment, PracticeNode } from '../db/types';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { loadLessonView } from '../routes/lessonRoute';
import { loadRouteModule } from '../routes/routeModule';
import { scheduleIdlePrefetch } from '../routes/idlePrefetch';

function prefetchLessonView(): void {
  void loadRouteModule(loadLessonView).catch(() => {
    // Speculative failures must leave navigation free to retry.
  });
}

// The course page's Other ways menu sits beside Study, so its session plan leaves them out.
const PAGE_OFFERS_OTHER_WAYS = { otherWays: false };

export const preloadCoursePath = useCoursePathRecords.preload;

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

  const records = useCoursePathRecords(courseId);
  const {
    course,
    lessons,
    courseCards,
    assessments,
    practiceNodes,
    lessonLinks,
    summary,
    archived,
    authoring,
    dataLoaded,
    lessonCardsById,
    now,
    examDateContext,
    studyFlowSnapshot,
    practiceProgressByKey,
    visibleNodes,
  } = useCoursePathData(records);
  const lineageId = course?.distributedCopy?.lineageId;
  const lineageMapping = useLiveQuery(
    () => (lineageId ? db.lineageIdMappings.get(lineageId) : undefined),
    [lineageId],
  );
  const learnerCheckpointIds = useMemo(
    () =>
      (assessments ?? [])
        .filter((assessment) => isLearnerOwnedCheckpoint(course, assessment, lineageMapping))
        .map((assessment) => assessment.id),
    [course, assessments, lineageMapping],
  );
  const lessonPrefetchKey =
    lessons
      ?.slice(0, 1)
      .map((lesson) => `/course/${courseId}/lesson/${lesson.id}`)
      .join('\n') ?? '';
  useEffect(
    () => scheduleIdlePrefetch(lessonPrefetchKey.split('\n').filter(Boolean), prefetchLessonView),
    [lessonPrefetchKey],
  );
  const pendingUpdate = usePendingMergeReview(courseId);
  // The keep-to-schedule forecast, shared with Today and the sidebar.
  const forecast = useCourseForecast(courseId);
  const notifyReorderError = useCallback(
    (message: string) => notify(message, 'negative'),
    [notify],
  );

  const localOrder = !!course?.distributedCopy?.locked && !archived;
  const lessonReorder = useCoursePathReorder(
    courseId ?? '',
    visibleNodes,
    lessons ?? [],
    courseCards ?? [],
    lessonLinks ?? [],
    authoring || localOrder,
    notifyReorderError,
    localOrder,
    learnerCheckpointIds,
    examDateContext?.specificationContext,
  );

  usePageShortcuts({
    s:
      dataLoaded && course && !archived
        ? () => openStudySheet(courseId, PAGE_OFFERS_OTHER_WAYS)
        : undefined,
  });

  // Wait for course and lesson data before showing access-dependent actions.
  if (!dataLoaded) {
    return <PageLoading />;
  }

  // Course not found.
  if (course === null || summary === null) {
    return (
      <MissingRecord message="This course could not be found." to="/">
        Back to Today
      </MissingRecord>
    );
  }

  const lastLesson = resolveCourseLessonOrder(course, lessons, assessments, practiceNodes).at(-1);
  const orderReason = course.localLessonOrder
    ? localLessonOrderUnavailableReason(course, lessons, assessments, practiceNodes)
    : undefined;
  const orderNotice = orderReason ? (
    <p role="status" className="text-sm text-ink-soft">
      Saved lesson order is suspended. {orderReason} Using publisher order.
    </p>
  ) : null;
  const pathEditors = archived ? null : (
    <AnimatePresence>
      {selectedAssessmentId &&
        assessments.find((assessment) => assessment.id === selectedAssessmentId) && (
          <AssessmentDetailSheet
            assessment={assessments.find((assessment) => assessment.id === selectedAssessmentId)!}
            lessons={lessons}
            cards={courseCards}
            links={lessonLinks}
            preferredLessonIds={courseLessonOrderPreference(course)}
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
          cards={courseCards}
          links={lessonLinks}
          node={practiceEditor.node}
          defaultPosition={practiceEditor.defaultPosition}
          onSaved={() => setPracticeEditor(null)}
        />
      )}
      {assessmentEditor && (
        <AssessmentPathEditor
          courseId={course.id}
          assessment={assessmentEditor.assessment}
          defaultAfterLessonId={assessmentEditor.defaultAfterLessonId}
          lessons={lessons}
          cards={courseCards}
          links={lessonLinks}
          timeZone={course.timeZone}
          preferredLessonIds={courseLessonOrderPreference(course)}
          learnerOwnedOnly={localOrder}
          onSaved={() => setAssessmentEditor(null)}
        />
      )}
    </AnimatePresence>
  );

  const dueReviewCardIds = studyFlowSnapshot?.dueReviewCardIds;
  const dueCardCount = dueReviewCardIds?.size ?? 0;
  const otherWays = [
    ...((studyFlowSnapshot?.examPracticeEligibleCount ?? 0) > 0
      ? [
          {
            label: 'Practise for exam',
            description: 'Cards below the exam target, including cards not yet due',
            onSelect: () => navigate(`/course/${courseId}/study?review=exam`),
          },
        ]
      : []),
    {
      // Named as in the session plan's Other ways, which offers the same session.
      label: 'Only review due cards',
      description: 'Skip new cards and lessons',
      disabled: dueCardCount === 0,
      onSelect: () => navigate(`/course/${courseId}/study?review=due`),
    },
    ...assessments
      .filter((assessment) => assessment.examDate !== undefined && assessment.examDate > now)
      .map((assessment) => ({
        label: `Revise for ${assessment.name}`,
        description: `Ready by ${formatShortDate(assessment.examDate as number, assessment.timeZone ?? course.timeZone)}`,
        onSelect: () =>
          navigate(`/course/${courseId}/study?assessmentId=${encodeURIComponent(assessment.id)}`),
      })),
  ];
  // Course cards reviewed since the start of today fill the ring beside Study.
  const todayStart = startOfDay(now, course.timeZone);
  const doneToday = (courseCards ?? []).filter(
    (card) => card.lastReviewed !== null && card.lastReviewed >= todayStart,
  ).length;
  const studyActions = (disabled = false) => (
    <CourseStudyActions
      courseId={course.id}
      dueCount={dueCardCount}
      doneToday={doneToday}
      disabled={disabled}
      onStudy={() => openStudySheet(courseId, PAGE_OFFERS_OTHER_WAYS)}
      otherWays={otherWays}
    />
  );

  // Release-date map for the "locked" hint (see lockHintFor below) — only
  // consulted under `linear` unlock mode.
  const effectiveDates = lessonEffectiveReleaseDates(course, lessons);

  // Summary figures: mastery is passed in from the course-level summary (extension-lesson
  // cards already excluded there) and stands in for the forecast until it loads. The due
  // count is the snapshot's, so it matches the Review due cards session it opens.
  const { mastery } = courseHeaderStats(course, assessments, summary?.mastery ?? 0, now);

  // Selected lesson detail includes linked cards, due reviews and mastery.
  const detailForLesson = (lessonId: string) => {
    const cards = lessonCardsById.get(lessonId) ?? [];
    return {
      cardCount: cards.length,
      dueCount: cards.filter((card) => dueReviewCardIds?.has(card.id)).length,
      masteryPct: Math.round(progressValue(cards, course, now, examDateContext) * 100),
    };
  };
  const hasStudyContent = lessons.length > 0 || courseCards.length > 0;
  const cardTotal = courseCards.length;
  const lessonTotal = lessons.filter((lesson) => !lesson.isExtension).length;
  const status = forecast ? forecastStatus(forecast) : undefined;
  const forecastPct = Math.round((forecast?.ifStopped ?? mastery) * 100);
  return (
    <div key={course.id} className={`${COURSE_PAGE_FRAME} flex flex-col gap-8 pb-12`}>
      {orderNotice}
      <header
        data-page-part=""
        className="flex flex-wrap items-start justify-between gap-4 pt-6 md:pt-8"
      >
        <CourseHeader
          className="min-w-0 flex-[1_1_320px]"
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
        />
        {!archived && hasStudyContent && studyActions()}
      </header>
      {!archived && pendingUpdate && (
        <Link
          to={`/course/${courseId}/updates`}
          className="self-start rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          Review updates
        </Link>
      )}
      {archived && <ArchivedCourseRestoreNotice />}
      <CourseOverview
        summary={(cardClassName) =>
          hasStudyContent && (
            <CourseSummaryCard
              className={cardClassName}
              recallPct={forecastPct}
              recallLabel={
                assessments.some((assessment) => assessment.coverageMode === 'specification')
                  ? 'Predicted recall'
                  : undefined
              }
              status={status ?? 'steady'}
              cards={cardTotal}
              lessons={lessonTotal}
            />
          )
        }
        courseId={course.id}
        nodes={visibleNodes}
        lessonCount={lessons.length}
        assessments={assessments}
        timeZone={course.timeZone}
        authoring={authoring}
        localOrder={localOrder}
        learnerCheckpointIds={learnerCheckpointIds}
        archived={archived}
        announcement={lessonReorder.announcement}
        reorderFor={lessonReorder.interactionFor}
        onLessonMove={lessonReorder.moveBy}
        detailForLesson={detailForLesson}
        lockHint={(id) => lockHintFor(course, id, effectiveDates)}
        practiceProgress={practiceProgressByKey}
        onLessonOpen={(id) => navigate(`/course/${courseId}/lesson/${id}`)}
        onLessonCreated={(lesson) => navigate(`/course/${courseId}/lesson/${lesson.id}`)}
        onPracticeOpen={(node) =>
          authoring && node.practiceNode
            ? setPracticeEditor({ node: node.practiceNode })
            : navigate(`/course/${courseId}/study?practiceNode=${encodeURIComponent(node.nodeKey)}`)
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
          if (authoring || learnerCheckpointIds.includes(id)) setAssessmentEditor({ assessment });
          else setSelectedAssessmentId(id);
        }}
        onAdd={(kind) => {
          if (localOrder && kind !== 'checkpoint') return;
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
