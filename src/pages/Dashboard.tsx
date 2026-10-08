import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { Skeleton } from '../components/ui/Skeleton';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourseDashboardData, usePendingUpdateCourseIds } from '../state/useCourseData';
import { SyncStatus } from '../components/dashboard/SyncStatus';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import {
  ForecastChart,
  forecastStatus,
  type ForecastLine,
} from '../components/dashboard/ForecastChart';
import { WeekPanel } from '../components/dashboard/WeekPanel';
import { TodayQueue, type QueueRow } from '../components/dashboard/TodayQueue';
import { Button } from '../components/ui/Button';
import { useStudySheet } from '../components/learn/StudySheetContext';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { CardsIcon, ClockIcon } from '../components/ui/icons';
import { CountUp } from '../components/ui/Celebration';
import { MOTION_EASING } from '../components/ui/motion';
import { NewCourseControl } from '../components/course/NewCourseControl';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { dashboardForecastHistories, urgencyOrder } from '../state/dashboardForecasts';
import { forecastWindow, useForecastRange } from '../state/forecastRange';
import { useAllReviewHistory } from '../state/useData';
import { weekSummary } from '../state/weekSummary';
import { updateCourse } from '../db/courseRepository';
import { useToast } from '../components/ui/Toast';
import type { ArchiveTarget, CourseMenuState } from '../components/dashboard/CourseActions';

// The course actions open on demand, so they stay out of the first-load bundle.
const SharingAnnouncement = lazy(() =>
  import('../components/layout/SharingAnnouncement').then((module) => ({
    default: module.SharingAnnouncement,
  })),
);
const CourseContextMenu = lazy(() =>
  import('../components/dashboard/CourseActions').then((module) => ({
    default: module.CourseContextMenu,
  })),
);
const ArchiveCourseDialog = lazy(() =>
  import('../components/dashboard/CourseActions').then((module) => ({
    default: module.ArchiveCourseDialog,
  })),
);

export function Dashboard() {
  const frame = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const archiveFocus = useRef<{ courseId: string; index: number } | null>(null);
  const data = useCourseDashboardData();
  const courses = data?.courses;
  const summaries = data?.summaries;
  const stats = data?.stats;
  const pendingUpdateIds = usePendingUpdateCourseIds();
  const navigate = useNavigate();
  const { openStudySheet } = useStudySheet();
  const location = useLocation();
  const [creatingCourse, setCreatingCourse] = useState(false);
  useEffect(() => {
    if (location.state?.createCourse) {
      setCreatingCourse(true);
      void navigate('/', { replace: true, state: null });
    }
  }, [location.state, navigate]);
  const { notify } = useToast();
  const [courseMenu, setCourseMenu] = useState<CourseMenuState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Background check for teacher republishes of share-linked courses. The poll
  // module (with the merge importer and course-file decoder) loads on demand so
  // none of that weight joins the initial bundle; the dashboard never waits on
  // it either. A merged update surfaces through the existing pending-review
  // badge. A failed chunk load simply retries on the next dashboard visit.
  useEffect(() => {
    let cancelled = false;
    void import('../shareLinks/polling')
      .then(({ pollShareUpdates }) => {
        if (!cancelled) void pollShareUpdates();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Archived courses are hidden from the dashboard.
  const activeCourses = useMemo(() => courses?.filter((c) => !c.archived), [courses]);

  // Forecasts come with the shared course data, cached per course.
  const forecasts = data?.forecasts;

  const today = stats?.forecast[0];
  const rows = useMemo<QueueRow[] | undefined>(() => {
    if (!activeCourses) return undefined;
    const unordered = activeCourses.map((course) => {
      const forecast = forecasts?.[course.id];
      const slice = today?.byDeck.find((entry) => entry.sourceId === course.id);
      const pending = pendingUpdateIds?.has(course.id) ?? false;
      return {
        id: course.id,
        name: course.name,
        examDate: course.examDate,
        status: forecast ? forecastStatus(forecast) : course.examDate ? 'ahead' : 'steady',
        due: summaries?.[course.id]?.eligible ?? 0,
        minutes: slice?.minutes ?? 0,
        href: pending ? `/course/${course.id}/updates` : `/course/${course.id}`,
        hasPendingUpdate: pending,
      } satisfies QueueRow & { examDate?: number };
    });
    return urgencyOrder(unordered, Date.now());
  }, [activeCourses, forecasts, today, summaries, pendingUpdateIds]);

  // The chart traces each forecast back over the chosen window, which needs graded
  // review history; navigation's shared data carries only review timestamps.
  const reviewHistory = useAllReviewHistory();
  const [forecastRange] = useForecastRange();
  const chartWindow = forecastWindow(forecastRange);
  const histories = useMemo(() => {
    if (!data || !forecasts || !reviewHistory) return undefined;
    const now = Date.now();
    return dashboardForecastHistories(
      data.courses,
      data.lessons,
      data.allCards,
      reviewHistory,
      forecasts,
      now - chartWindow.past * 86_400_000,
      now,
    );
  }, [data, forecasts, reviewHistory, chartWindow.past]);
  const lines = useMemo<ForecastLine[]>(
    () =>
      (rows ?? []).flatMap((row) => {
        const forecast = forecasts?.[row.id];
        const history = histories?.[row.id];
        return forecast && history
          ? [{ id: row.id, name: row.name, status: row.status, forecast, history }]
          : [];
      }),
    [rows, forecasts, histories],
  );

  useLayoutEffect(() => {
    const pending = archiveFocus.current;
    if (!pending || archiveTarget || !rows || rows.some((row) => row.id === pending.courseId))
      return;
    archiveFocus.current = null;
    const active = document.activeElement;
    // Preserve focus if another action was chosen whilst the archive was pending.
    if (active && active !== document.body && !active.closest('[data-course-archive-dialog]'))
      return;
    const next = rows[Math.min(pending.index, rows.length - 1)];
    const target = next
      ? Array.from(
          frame.current?.querySelectorAll<HTMLButtonElement>('[data-course-menu-trigger]') ?? [],
        ).find((button) => button.dataset.courseMenuTrigger === next.id)
      : heading.current;
    target?.focus({ preventScroll: true });
  }, [archiveTarget, rows]);

  const reviewActivity = data?.reviewActivity;
  const week = useMemo(
    () =>
      reviewActivity ? weekSummary([...reviewActivity.values()].flat(), Date.now()) : undefined,
    [reviewActivity],
  );

  const firstCourseId = rows?.[0]?.id;
  usePageShortcuts({
    s: firstCourseId ? () => openStudySheet(firstCourseId) : undefined,
  });

  const totalCards = rows?.reduce((sum, row) => sum + row.due, 0) ?? 0;
  // A non-empty queue never reads as zero minutes.
  const totalMinutes = Math.max(
    totalCards > 0 ? 1 : 0,
    Math.round(rows?.reduce((sum, row) => sum + row.minutes, 0) ?? 0),
  );

  return (
    <div ref={frame} className={`${PAGE_FRAME} py-6 sm:py-10`}>
      <h1 ref={heading} tabIndex={-1} className="sr-only focus-visible:shadow-none">
        Today
      </h1>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-ink-soft sm:mb-6">
        {rows && rows.length > 0 && (
          <p
            className="flex items-center gap-5 sm:gap-6"
            aria-label={`Today: ${totalCards} ${totalCards === 1 ? 'card' : 'cards'}, about ${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`}
          >
            <span className="inline-flex items-center gap-2" aria-hidden="true">
              <CardsIcon width={20} height={20} />
              <strong className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
                <CountUp value={totalCards} multiplier={m} />
              </strong>
              {totalCards === 1 ? 'card' : 'cards'}
            </span>
            <span className="inline-flex items-center gap-2" aria-hidden="true">
              <ClockIcon width={20} height={20} />
              <strong className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
                <CountUp value={totalMinutes} multiplier={m} />
              </strong>
              min
            </span>
          </p>
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button variant="ghost" onClick={() => navigate('/import')}>
            Import
          </Button>
          <NewCourseControl open={creatingCourse} onOpenChange={setCreatingCourse} />
        </div>
      </div>

      <SyncStatus />

      {!rows ? (
        <DelayedFallback>
          <CourseSkeleton />
        </DelayedFallback>
      ) : rows.length === 0 ? (
        <EmptyState hasArchivedCourses={courses?.some((course) => course.archived) ?? false} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* What to study leads; the forecast explains it underneath. */}
          <TodayQueue
            rows={rows}
            openMenuId={courseMenu?.course.id}
            multiplier={m}
            onStudy={(id) => openStudySheet(id)}
            onMenu={(id, position, trigger) => {
              const course = activeCourses?.find((entry) => entry.id === id);
              if (!course) return;
              setArchiveTarget(null);
              setCourseMenu({ course, position, trigger });
            }}
          />
          {/* Below the queue, so the day's work is always the first thing on Today. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <SharingAnnouncement />
            </Suspense>
          </ErrorBoundary>
          {(lines.length > 0 || (week?.reviewed ?? 0) > 0) && (
            <motion.section
              aria-label="Forecast and this week"
              className="flex flex-col gap-5 rounded-[28px] bg-surface px-4 pb-5 pt-5 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] sm:px-6 sm:pb-6 sm:pt-7 md:px-8 md:pt-8"
              initial={m > 0 ? { opacity: 0, y: 12, scale: 0.99 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5 * m, delay: 0.15 * m, ease: MOTION_EASING.emphasised }}
            >
              {lines.length > 0 && <ForecastChart
                  lines={lines}
                  now={Date.now()}
                  past={chartWindow.past}
                  future={chartWindow.future}
                  multiplier={m}
                />}
              {week && stats && <WeekPanel week={week} streak={stats.streak} multiplier={m} />}
            </motion.section>
          )}
        </div>
      )}

      {courseMenu && (
        <Suspense fallback={null}>
          <CourseContextMenu
            {...courseMenu}
            onClose={(restoreFocus = true) => {
              setCourseMenu(null);
              if (restoreFocus) courseMenu.trigger.focus();
            }}
            onArchive={() => {
              setCourseMenu(null);
              setArchiveTarget({ course: courseMenu.course, trigger: courseMenu.trigger });
            }}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {archiveTarget && (
          <Suspense key="archive" fallback={null}>
            <ArchiveCourseDialog
              course={archiveTarget.course}
              onClose={() => {
                setArchiveTarget(null);
                archiveTarget.trigger.focus();
              }}
              onArchived={() => {
                archiveFocus.current = {
                  courseId: archiveTarget.course.id,
                  index: Math.max(
                    0,
                    rows?.findIndex((row) => row.id === archiveTarget.course.id) ?? 0,
                  ),
                };
                setArchiveTarget(null);
                notify(`${archiveTarget.course.name} archived`, 'positive', {
                  actionLabel: 'Undo',
                  onAction: () => {
                    void updateCourse(archiveTarget.course.id, { archived: false })
                      .then(() => notify(`${archiveTarget.course.name} restored`, 'positive'))
                      .catch(() =>
                        notify(`Could not restore ${archiveTarget.course.name}`, 'negative'),
                      );
                  },
                });
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

function CourseSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-80 rounded-[28px] bg-surface" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-[68px] items-center gap-4 rounded-[18px] bg-surface px-5">
          <div className="h-2.5 w-2.5 rounded-full bg-ink/10" />
          <Skeleton className="h-5 w-40 rounded bg-ink/10" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasArchivedCourses }: { hasArchivedCourses: boolean }) {
  return (
    <div className="relative flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="relative flex flex-col items-center">
        <StudyDrawing kind="course" className="mb-7 h-28 w-28" />
        <h2 className="mb-2 font-display text-2xl">
          {hasArchivedCourses ? 'No active courses' : 'No courses yet'}
        </h2>
        <p className="mb-6 max-w-sm text-ink-soft">
          {hasArchivedCourses
            ? 'Restore a course from Archived or start another one.'
            : 'Start a course to organise your lessons and cards.'}
        </p>
      </div>
    </div>
  );
}
