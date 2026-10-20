import { AppLink } from '../components/ui/AppLink';
import { buttonClassName } from '../components/ui/buttonStyles';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { Skeleton } from '../components/ui/Skeleton';
import { PageLoading, PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDelayedPending } from '../hooks/useDelayedPending';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourseDashboardData, usePendingUpdateCourseIds } from '../state/useCourseData';
import { SyncStatus } from '../components/dashboard/SyncStatus';
import { forecastStatus } from '../components/dashboard/forecastStatus';
import type { ForecastLine } from '../components/dashboard/ForecastChart';
import { useForecastChart } from '../components/dashboard/useForecastChart';
import { WeekPanel } from '../components/dashboard/WeekPanel';
import {
  leadStudyRow,
  queueState,
  TodayQueue,
  type QueueRow,
} from '../components/dashboard/TodayQueue';
import { useStudySheet } from '../components/learn/StudySheetContext';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { CardsIcon, ClockIcon } from '../components/ui/icons';
import { CountUp } from '../components/ui/Celebration';
import { MOTION_DURATION, MOTION_EASING } from '../components/ui/motion';
import { NewCourseControl } from '../components/course/NewCourseControl';
import { ImportControl } from '../components/import/ImportControl';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import {
  dashboardForecastHistories,
  forecastCards,
  urgencyOrder,
} from '../state/dashboardForecasts';
import type { ForecastPoint } from '../fsrs/courseForecast';
import type { KeepUpRequest, KeepUpResponse } from '../state/dashboardKeepUp';
import { forecastWindow, useForecastRange } from '../state/forecastRange';
import { useAllReviewHistory } from '../state/useData';
import { weekSummary } from '../state/weekSummary';
import { useToast } from '../components/ui/Toast';
import type { ArchiveTarget, CourseMenuState } from '../components/dashboard/CourseActions';

/**
 * The forecast leads Today, so the queue waits for it to arrive as one piece. A forecast
 * still pending after this long gives way: the queue appears beneath a placeholder.
 */
const FORECAST_WAIT_MS = 600;

// The course actions open on demand, so they stay out of the first-load bundle.
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

// Shared by every Today visit; the keep-up simulation needs the FSRS engine, which a
// worker keeps out of the initial bundle and off the main thread.
let keepUpWorker: Worker | undefined;
let keepUpRequest = 0;

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
  const importing = new URLSearchParams(location.search).has('import');
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
      const summary = summaries?.[course.id];
      const due = summary?.eligible ?? 0;
      const slice = today?.byDeck.find((entry) => entry.sourceId === course.id);
      const pending = pendingUpdateIds?.has(course.id) ?? false;
      return {
        id: course.id,
        name: course.name,
        examDate: course.examDate,
        status: forecast ? forecastStatus(forecast) : course.examDate ? 'ahead' : 'steady',
        state: queueState(summary),
        due,
        minutes: slice ? (slice.minutes / Math.max(1, slice.dueCount + slice.newCount)) * due : 0,
        href: pending ? `/course/${course.id}/updates` : `/course/${course.id}`,
        hasPendingUpdate: pending,
      } satisfies QueueRow & { examDate?: number };
    });
    return urgencyOrder(unordered, Date.now());
  }, [activeCourses, forecasts, today, summaries, pendingUpdateIds]);

  const reviewActivity = data?.reviewActivity;
  const week = useMemo(
    () =>
      reviewActivity ? weekSummary([...reviewActivity.values()].flat(), Date.now()) : undefined,
    [reviewActivity],
  );

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
  const [keepUp, setKeepUp] = useState<Record<string, ForecastPoint[]>>();
  useEffect(() => {
    if (!data || !reviewHistory || typeof Worker === 'undefined') return;
    keepUpWorker ??= new Worker(new URL('../workers/keepUp.worker.ts', import.meta.url), {
      type: 'module',
    });
    const worker = keepUpWorker;
    const id = ++keepUpRequest;
    const receive = (event: MessageEvent<KeepUpResponse>) => {
      if (event.data.id === id) setKeepUp(event.data.projections);
    };
    worker.addEventListener('message', receive);
    const now = Date.now();
    worker.postMessage({
      id,
      entries: forecastCards(data.courses, data.lessons, data.allCards, now),
      history: reviewHistory,
      now,
    } satisfies KeepUpRequest);
    return () => worker.removeEventListener('message', receive);
  }, [data, reviewHistory]);
  const lines = useMemo<ForecastLine[]>(
    () =>
      (rows ?? []).flatMap((row) => {
        const forecast = forecasts?.[row.id];
        const history = histories?.[row.id];
        return forecast && histories
          ? [
              {
                id: row.id,
                name: row.name,
                status: row.status,
                forecast,
                history: history ?? [],
                keepUp: keepUp?.[row.id],
              },
            ]
          : [];
      }),
    [rows, forecasts, histories, keepUp],
  );

  // The chart waits on review history anyway, so it loads alongside it rather than at start-up.
  const anyForecast = rows?.some((row) => forecasts?.[row.id]) ?? false;
  const { Chart: ForecastChart, settled: chartSettled } = useForecastChart(anyForecast);
  const forecastSettled =
    !anyForecast || (histories !== undefined && (lines.length === 0 || chartSettled));
  const forecastOverdue = useDelayedPending(
    rows !== undefined && !forecastSettled,
    FORECAST_WAIT_MS,
  );
  // Once Today has arrived it stays: live updates never send it back to the skeleton.
  const [arrived, setArrived] = useState(false);
  const ready = arrived || (rows !== undefined && (forecastSettled || forecastOverdue));
  useEffect(() => {
    if (ready) setArrived(true);
  }, [ready]);
  const showForecast =
    forecastSettled && ((ForecastChart !== null && lines.length > 0) || (week?.reviewed ?? 0) > 0);

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

  // S opens the same course as the leading Study button, never one with no work.
  const leadCourseId = rows ? leadStudyRow(rows)?.id : undefined;
  usePageShortcuts({
    s: leadCourseId ? () => openStudySheet(leadCourseId) : undefined,
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
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 text-ink-soft sm:mb-6 sm:gap-x-6">
        {rows && rows.length > 0 && (
          <p
            className="flex items-center gap-4 sm:gap-6"
            aria-label={`Today: ${totalCards} ${totalCards === 1 ? 'card' : 'cards'}, about ${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`}
          >
            <span className="inline-flex items-center gap-2" aria-hidden="true">
              <CardsIcon width={20} height={20} className="max-sm:hidden" />
              <strong className="font-display text-xl font-semibold tracking-tight text-ink tabular-nums sm:text-2xl">
                <CountUp value={totalCards} multiplier={m} />
              </strong>
              {totalCards === 1 ? 'card' : 'cards'}
            </span>
            <span className="inline-flex items-center gap-2" aria-hidden="true">
              <ClockIcon width={20} height={20} className="max-sm:hidden" />
              <strong className="font-display text-xl font-semibold tracking-tight text-ink tabular-nums sm:text-2xl">
                <CountUp value={totalMinutes} multiplier={m} />
              </strong>
              min
            </span>
          </p>
        )}
        <SyncStatus />
        {/* A bordered action beside the statistics keeps Study on a phone's first screen. */}
        <div inert={importing}>
          <AppLink
            to="/?import=1&join=1"
            onClick={() => setCreatingCourse(false)}
            className={buttonClassName('secondary', 'sm')}
          >
            Join a class
          </AppLink>
        </div>
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-2">
          <div inert={importing}>
            <NewCourseControl
              open={creatingCourse && !importing}
              onOpenChange={setCreatingCourse}
            />
          </div>
          <ImportControl onOpen={() => setCreatingCourse(false)} />
        </div>
      </div>

      <PageLoadingBoundary fallback={<CourseSkeleton />}>
        {!rows || !ready ? (
          <PageLoading />
        ) : rows.length === 0 ? (
          <EmptyState hasArchivedCourses={courses?.some((course) => course.archived) ?? false} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* The forecast arrives whole, fading in place, and holds its room while late. */}
            {!forecastSettled ? (
              <ForecastPlaceholder />
            ) : (
              showForecast && (
                <motion.section
                  aria-label="Forecast and this week"
                  className="flex flex-col gap-5 rounded-3xl bg-surface p-5 card-surface md:p-6"
                  initial={m > 0 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: MOTION_DURATION.local * m,
                    ease: MOTION_EASING.emphasised,
                  }}
                >
                  {ForecastChart && lines.length > 0 && (
                    <ForecastChart
                      lines={lines}
                      now={Date.now()}
                      past={chartWindow.past}
                      future={chartWindow.future}
                      multiplier={m}
                    />
                  )}
                  {week && stats && <WeekPanel week={week} streak={stats.streak} multiplier={m} />}
                </motion.section>
              )
            )}
            {/* The queue follows the forecast that explains it, starting as the forecast settles. */}
            <TodayQueue
              rows={rows}
              delay={showForecast ? MOTION_DURATION.local * 0.6 : 0}
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
          </div>
        )}
      </PageLoadingBoundary>

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
                    void import('../db/courseRepository')
                      .then(({ updateCourse }) =>
                        updateCourse(archiveTarget.course.id, { archived: false }),
                      )
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

/** Holds about the room the forecast surface takes, so its arrival barely moves the queue. */
function ForecastPlaceholder() {
  return <Skeleton className="h-[540px] rounded-3xl bg-surface sm:h-[520px] lg:h-[480px]" />;
}

function CourseSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <ForecastPlaceholder />
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
