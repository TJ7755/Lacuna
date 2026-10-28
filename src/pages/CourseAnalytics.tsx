import { MissingRecord } from '../components/course/MissingRecord';
// Course-scoped analytics page.
// Route: /course/:courseId/analytics

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCourseReviewHistory } from '../state/useCourseData';
import { useCourseProgressRecords } from '../state/useCourseProgressRecords';
import { useQuestionEvidence } from '../state/useQuestionEvidence';
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
import { PaperForecastCard } from '../components/analytics/PaperForecastCard';
import { QuestionEvidenceCard } from '../components/analytics/QuestionEvidenceCard';
import {
  buildCourseProgress,
  scopeQuestions,
  selectableAssessments,
} from '../course/courseProgress';
import { progressHeading } from '../fsrs/objective';
import { SpecificationProgress } from '../components/analytics/SpecificationProgress';
import { useCourseConceptPractice } from '../state/useCourseConceptPractice';

export function CourseAnalytics() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Null-sentinel to distinguish "loading" from "not found", matching CoursePath
  // and CourseSettings.
  const records = useCourseProgressRecords(courseId);
  const course = records?.course;
  const reviewHistory = useCourseReviewHistory(courseId);
  const questionData = useCourseQuestionData(courseId);
  const conceptPractice = useCourseConceptPractice(
    course?.specificationData ? courseId : undefined,
  );
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
        concepts: records.concepts,
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
  // Lesson-linked questions and exam-question evidence both follow the selected scope.
  const questionAnalytics = useMemo(() => {
    if (!questionData || !progress) return null;
    const scoped = scopeQuestions(progress.report, questionData.questions, questionData.attempts);
    return buildQuestionAnalytics(scoped.questions, scoped.attempts);
  }, [questionData, progress]);
  const questionEvidence = useQuestionEvidence(courseId, progress?.report.conceptIds);
  const scopeSelect = useRef<HTMLSelectElement>(null);

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
  const selectScope = (id: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('assessment', id);
    else next.delete('assessment');
    setSearchParams(next, { replace: true });
  };
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
          onScopeChange={selectScope}
          scopeSelectRef={scopeSelect}
        />
      </Rise>

      {chartDate !== undefined ? (
        <Rise index={2}>
          <CourseForecastCard
            course={{ ...course, examDate: chartDate }}
            lessons={records.lessons}
            cards={report.cards}
            history={reviewHistory}
            multiplier={m}
          />
        </Rise>
      ) : (
        report.forecast.kind === 'applicable' &&
        report.forecast.papers.length > 1 && (
          <Rise index={2}>
            <PaperForecastCard
              papers={report.forecast.papers}
              objectiveLabel={progressHeading(course)}
              timeZone={report.timeZone}
              onSelect={(id) => {
                selectScope(id);
                // The paper table leaves with the whole-course scope; keep focus on the scope.
                scopeSelect.current?.focus();
              }}
            />
          </Rise>
        )
      )}

      {questionEvidence && (
        <Rise index={3}>
          <QuestionEvidenceCard evidence={questionEvidence} />
        </Rise>
      )}

      <SpecificationProgress
        key={course.id}
        input={{ ...records, course, assessmentId, now: progress.now }}
        practice={conceptPractice}
      />

      <Rise index={4}>
        <QuestionAnalyticsSection analytics={questionAnalytics} />
      </Rise>

      <Rise index={5} className="flex flex-col gap-4 md:gap-6">
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
