import { Skeleton } from '../components/ui/Skeleton';
// Course-scoped analytics page.
// Route: /course/:courseId/analytics

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useCourse,
  useLessons,
  useCourseCards,
  useCourseReviewHistory,
} from '../state/useCourseData';
import { CourseAnalytics as CourseAnalyticsCharts } from '../components/analytics/CourseAnalytics';
import { QuestionAnalyticsSection } from '../components/questions/QuestionAnalyticsSection';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { buildQuestionAnalytics } from '../questions/analytics';
import { Rise } from '../components/analytics/Arrival';
import { KpiRow } from '../components/analytics/KpiRow';
import { CourseForecastCard } from '../components/analytics/CourseForecastCard';
import { reviewVolume, studyTimeSeries, totalStudyMinutes } from '../components/analytics/prepare';
import { masteryFraction } from '../fsrs/progress';

function CourseAnalyticsSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-8`}>
      <div className="mb-8 pt-6 md:pt-8">
        <Skeleton className="h-11 w-56 rounded-lg bg-ink/10" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-64 animate-pulse rounded-3xl bg-ink/5 ${i < 2 ? 'lg:col-span-2' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

export function CourseAnalytics() {
  const { courseId } = useParams<{ courseId: string }>();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Null-sentinel to distinguish "loading" from "not found", matching CoursePath
  // and CourseSettings.
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const cards = useCourseCards(courseId);
  const reviewHistory = useCourseReviewHistory(courseId);
  const questionData = useCourseQuestionData(courseId);
  const figures = useMemo(() => {
    if (!course || !cards || !reviewHistory) return null;
    const now = Date.now();
    return {
      mastery: Math.round(masteryFraction(cards, course) * 100),
      reviews: reviewVolume(cards, 30, now, reviewHistory).reduce((sum, p) => sum + p.reviews, 0),
      minutes: totalStudyMinutes(studyTimeSeries(cards, 30, now, reviewHistory)),
    };
  }, [course, cards, reviewHistory]);
  const questionAnalytics = useMemo(
    () =>
      questionData ? buildQuestionAnalytics(questionData.questions, questionData.attempts) : null,
    [questionData],
  );

  if (
    course === undefined ||
    lessons === undefined ||
    cards === undefined ||
    reviewHistory === undefined ||
    questionData === undefined ||
    questionAnalytics === null
  ) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading course analytics">
        <DelayedFallback>
          <CourseAnalyticsSkeleton />
        </DelayedFallback>
      </div>
    );
  }

  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to Today
        </Link>
      </div>
    );
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} flex flex-col gap-4 pb-8 md:gap-6`}>
      <Rise index={0} className="pt-6 md:pt-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          Progress
        </h1>
      </Rise>

      {figures && (
        <Rise index={1}>
          <KpiRow
            label="Summary"
            multiplier={m}
            items={[
              { label: 'Mastery', value: figures.mastery, unit: '%' },
              { label: 'Cards', value: cards.length },
              { label: 'Reviews, 30 days', value: figures.reviews },
              { label: 'Study time, 30 days', value: figures.minutes, unit: 'min' },
            ]}
          />
        </Rise>
      )}

      <Rise index={2}>
        <CourseForecastCard
          course={course}
          lessons={lessons}
          cards={cards}
          history={reviewHistory}
          multiplier={m}
        />
      </Rise>

      <Rise index={3}>
        <QuestionAnalyticsSection analytics={questionAnalytics} />
      </Rise>

      <Rise index={4} className="flex flex-col gap-4 md:gap-6">
        <h2 className="font-display text-2xl text-ink">Cards</h2>
        <CourseAnalyticsCharts
          course={course}
          lessons={lessons}
          cards={cards}
          reviewHistory={reviewHistory}
        />
      </Rise>
    </div>
  );
}
