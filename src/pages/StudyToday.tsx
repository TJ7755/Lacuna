import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourseDashboardData } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, PlusIcon } from '../components/ui/icons';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { readActiveStudyFlow } from '../state/activeStudyFlow';

export function StudyToday() {
  const data = useCourseDashboardData();
  const navigate = useNavigate();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const courses = useMemo(
    () =>
      data?.courses
        .filter((course) => !course.archived)
        .sort((a, b) => (b.lastInteractedAt ?? b.createdAt) - (a.lastInteractedAt ?? a.createdAt)),
    [data?.courses],
  );
  const activeFlow = useMemo(() => readActiveStudyFlow(), []);
  const resumableCourse = courses?.find((course) => course.id === activeFlow?.courseId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Link
        to="/"
        className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Dashboard
      </Link>

      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
        <div className="relative">
          <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">Study today</p>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">Choose a course</h1>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">
            Lacuna will pick up from the next useful step in that course.
          </p>
        </div>
      </header>

      {courses === undefined ? (
        <div aria-label="Loading courses" className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-line bg-surface"
            />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center">
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <h2 className="font-display text-2xl">No active courses</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
              Create a course before starting a guided study flow.
            </p>
            <Button className="mt-6" variant="primary" onClick={() => navigate('/')}>
              <PlusIcon width={16} height={16} />
              Go to courses
            </Button>
          </div>
        </div>
      ) : (
        <>
          {resumableCourse && (
            <button
              type="button"
              onClick={() => navigate(`/course/${resumableCourse.id}/study`)}
              className="mb-6 flex min-h-20 w-full items-center gap-4 rounded-2xl border border-accent/30 bg-accent/[0.04] px-5 py-4 text-left transition-colors hover:bg-accent/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <PlayIcon width={18} height={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs uppercase tracking-[0.14em] text-ink-faint">
                  Resume study flow
                </span>
                <span className="mt-1 block truncate font-display text-xl text-ink">
                  {resumableCourse.name}
                </span>
              </span>
              <ChevronRightIcon width={18} height={18} className="shrink-0 text-accent" />
            </button>
          )}
          <div className="space-y-3" aria-label="Courses">
            {courses.map((course, index) => {
              const summary = data?.summaries[course.id];
              const lessonCount = summary?.lessonCount ?? 0;
              const cardCount = summary?.cardCount ?? 0;
              const eligible = summary?.eligible ?? 0;
              return (
                <motion.button
                  key={course.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2 * m,
                    delay: Math.min(index * 0.04, 0.2) * m,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onClick={() => navigate(`/course/${course.id}/study`)}
                  className="group flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left shadow-sm shadow-black/[0.02] transition-colors hover:border-accent/40 hover:bg-accent/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <PlayIcon width={18} height={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-xl text-ink">
                      {course.name}
                    </span>
                    <span className="mt-1 block text-sm text-ink-soft">
                      {eligible > 0 ? `${eligible} ready` : 'Continue learning'}
                      {' · '}
                      {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
                      {' · '}
                      {cardCount} card{cardCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRightIcon
                    width={18}
                    height={18}
                    className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
