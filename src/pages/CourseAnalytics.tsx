// Course-scoped analytics page.
// Route: /course/:courseId/analytics

import { Link, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import {
  useCourse,
  useLessons,
  useCourseCards,
  useCourseSessionHistory,
} from '../state/useCourseData';
import { CourseAnalytics as CourseAnalyticsCharts } from '../components/analytics/CourseAnalytics';
import { ChevronLeftIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';

function CourseAnalyticsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-56 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={i < 2 ? 'lg:col-span-2' : undefined}>
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="mb-4 space-y-2">
                <div className="h-7 w-36 animate-pulse rounded-lg bg-ink/5" />
                <div className="h-4 w-64 animate-pulse rounded-lg bg-ink/5" />
              </div>
              <div className="h-56 animate-pulse rounded-lg bg-ink/5" />
            </div>
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
  const history = useCourseSessionHistory(courseId);

  if (
    course === undefined ||
    lessons === undefined ||
    cards === undefined ||
    history === undefined
  ) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading course analytics">
        <CourseAnalyticsSkeleton />
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
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <Link
        to={`/course/${course.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Back to {course.name}
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8"
      >
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <h1 className="font-display text-3xl tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-ink-soft">{course.name}</p>
        </div>
      </motion.header>

      <CourseAnalyticsCharts course={course} lessons={lessons} cards={cards} history={history} />
    </div>
  );
}
