import { MissingRecord } from '../components/course/MissingRecord';
// Course-scoped analytics page.
// Route: /course/:courseId/analytics

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCourseReviewHistory } from '../state/useCourseData';
import { useCoursePathRecords } from '../state/useCourseStudyFlowRecords';
import { CourseAnalytics as CourseAnalyticsCharts } from '../components/analytics/CourseAnalytics';
import { QuestionAnalyticsSection } from '../components/questions/QuestionAnalyticsSection';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { buildQuestionAnalytics } from '../questions/analytics';
import { Rise } from '../components/analytics/Arrival';
import { KpiRow } from '../components/analytics/KpiRow';
import { CourseForecastCard } from '../components/analytics/CourseForecastCard';
import { ProgressOverview } from '../components/analytics/ProgressOverview';
import { reviewVolume, studyTimeSeries, totalStudyMinutes } from '../components/analytics/prepare';
import { buildCourseProgress, selectableAssessments } from '../course/courseProgress';

export function CourseAnalytics() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Null-sentinel to distinguish "loading" from "not found", matching CoursePath
  // and CourseSettings.
  const records = useCoursePathRecords(courseId);
  const course = records?.course;
  const reviewHistory = useCourseReviewHistory(courseId);
  const questionData = useCourseQuestionData(courseId);
  // The selected scope lives in the URL, so it survives reloads without stored state.
  const requestedAssessmentId = searchParams.get('assessment') ?? undefined;
  const assessments = useMemo(
    () =>
      records?.course
        ? selectableAssessments(records.assessments, records.course.id, Date.now())
        : [],
    [records],
  );
  const assessmentId = assessments.some((assessment) => assessment.id === requestedAssessmentId)
    ? requestedAssessmentId
    : undefined;
  const progress = useMemo(() => {
    if (!records?.course) return null;
    const now = Date.now();
    return {
      now,
      report: buildCourseProgress({
        course: records.course,
        lessons: records.lessons,
        cards: records.cards,
        assessments: records.assessments,
        links: records.links,
        exposures: records.exposures,
        concepts: records.concepts ?? [],
        assessmentId,
        now,
      }),
    };
  }, [records, assessmentId]);
  const activity = useMemo(() => {
    if (!records?.course || !reviewHistory) return null;
    const now = Date.now();
    return {
      reviews: reviewVolume(records.cards, 30, now, reviewHistory).reduce(
        (sum, p) => sum + p.reviews,
        0,
      ),
      minutes: totalStudyMinutes(studyTimeSeries(records.cards, 30, now, reviewHistory)),
    };
  }, [records, reviewHistory]);
  const questionAnalytics = useMemo(
    () =>
      questionData ? buildQuestionAnalytics(questionData.questions, questionData.attempts) : null,
    [questionData],
  );

  if (
    records === undefined ||
    reviewHistory === undefined ||
    questionData === undefined ||
    questionAnalytics === null
  ) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading course analytics">
        <PageLoading />
      </div>
    );
  }

  if (!course || !progress) {
    return (
      <MissingRecord message="This course could not be found." to="/">
        Back to Today
      </MissingRecord>
    );
  }

  const { report } = progress;
  // The exam-day chart draws one date. A whole course whose cards target different
  // papers has no single date, so only the overview's per-paper figure applies.
  const chartDate =
    report.forecast.kind === 'assessment'
      ? report.forecast.date
      : report.forecast.kind === 'applicable'
        ? report.forecast.sharedDate
        : undefined;

  return (
    <div className={`${COURSE_PAGE_FRAME} flex flex-col gap-4 pb-8 md:gap-6`}>
      <Rise index={0} className="pt-6 md:pt-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Progress
        </h1>
      </Rise>

      <Rise index={1}>
        <ProgressOverview
          course={course}
          report={report}
          assessments={assessments}
          now={progress.now}
          onScopeChange={(id) => {
            const next = new URLSearchParams(searchParams);
            if (id) next.set('assessment', id);
            else next.delete('assessment');
            setSearchParams(next, { replace: true });
          }}
        />
      </Rise>

      {chartDate !== undefined && (
        <Rise index={2}>
          <CourseForecastCard
            course={{ ...course, examDate: chartDate }}
            lessons={records.lessons}
            cards={report.cards}
            history={reviewHistory}
            multiplier={m}
          />
        </Rise>
      )}

      <Rise index={3}>
        <QuestionAnalyticsSection analytics={questionAnalytics} />
      </Rise>

      <Rise index={4} className="flex flex-col gap-4 md:gap-6">
        <h2 className="font-display text-2xl text-ink">Cards</h2>
        {activity && (
          <KpiRow
            label="Recent activity"
            multiplier={m}
            items={[
              { label: 'Reviews, 30 days', value: activity.reviews },
              { label: 'Study time, 30 days', value: activity.minutes, unit: 'min' },
            ]}
          />
        )}
        <CourseAnalyticsCharts
          course={course}
          lessons={report.lessons}
          cards={records.cards}
          reviewHistory={reviewHistory}
        />
      </Rise>
    </div>
  );
}
