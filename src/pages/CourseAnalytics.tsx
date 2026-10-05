// Course-scoped analytics page.
// Route: /course/:courseId/analytics

import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import {
  useCourse,
  useLessons,
  useCourseCards,
  useCourseReviewHistory,
  useCourseSessionHistory,
} from '../state/useCourseData';
import { CourseAnalytics as CourseAnalyticsCharts } from '../components/analytics/CourseAnalytics';
import { QuestionAnalyticsSection } from '../components/questions/QuestionAnalyticsSection';
import { useCourseQuestionData } from '../components/questions/useQuestionData';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { buildQuestionAnalytics } from '../questions/analytics';
import { Skeleton } from '../components/ui/Skeleton';
import { SectionCard } from '../components/ui/SectionCard';

function CourseAnalyticsSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-8`}>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={i < 2 ? 'lg:col-span-2' : undefined}>
            <SectionCard as="div" compact>
              <div className="mb-4 space-y-2">
                <Skeleton className="h-7 w-36 rounded-lg bg-ink/5" />
              </div>
              <Skeleton className="h-56 rounded-lg bg-ink/5" />
            </SectionCard>
          </div>
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
  const history = useCourseSessionHistory(courseId);
  const questionData = useCourseQuestionData(courseId);
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
    history === undefined ||
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
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-8`}>
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-8 pt-6 md:pt-8"
      >
        <div className="relative">
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Analytics</h1>
        </div>
      </motion.header>

      <QuestionAnalyticsSection analytics={questionAnalytics} />

      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Cards</h2>
      </div>
      <CourseAnalyticsCharts
        course={course}
        lessons={lessons}
        cards={cards}
        reviewHistory={reviewHistory}
        history={history}
      />
    </div>
  );
}
