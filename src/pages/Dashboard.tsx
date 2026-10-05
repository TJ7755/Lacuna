import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { ModalBackdrop } from '../components/ui/ModalBackdrop';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourseDashboardData, usePendingUpdateCourseIds } from '../state/useCourseData';
import { SyncStatus } from '../components/dashboard/SyncStatus';
import {
  ForecastChart,
  forecastStatus,
  type ForecastLine,
} from '../components/dashboard/ForecastChart';
import { WeekPanel } from '../components/dashboard/WeekPanel';
import { TodayQueue, type QueueRow } from '../components/dashboard/TodayQueue';
import { Button } from '../components/ui/Button';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { CardsIcon, ClockIcon, PlusIcon } from '../components/ui/icons';
import { CountUp } from '../components/ui/Celebration';
import { MOTION_EASING } from '../components/ui/motion';
import { NewCourseForm } from '../components/course/NewCourseForm';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { urgencyOrder } from '../state/dashboardForecasts';
import { weekSummary } from '../state/weekSummary';
import { updateCourse } from '../db/courseRepository';
import { useToast } from '../components/ui/Toast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { Course } from '../db/types';

interface CourseMenuState {
  course: Course;
  position: { x: number; y: number };
  trigger: HTMLButtonElement;
}

interface ArchiveTarget {
  course: Course;
  trigger: HTMLButtonElement;
}

export function Dashboard() {
  const data = useCourseDashboardData();
  const courses = data?.courses;
  const summaries = data?.summaries;
  const stats = data?.stats;
  const pendingUpdateIds = usePendingUpdateCourseIds();
  const navigate = useNavigate();
  const [creatingCourse, setCreatingCourse] = useState(false);
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

  const lines = useMemo<ForecastLine[]>(
    () =>
      (rows ?? []).flatMap((row) => {
        const forecast = forecasts?.[row.id];
        return forecast && forecast.outlook.some((point) => point.recall > 0)
          ? [{ id: row.id, name: row.name, status: row.status, forecast }]
          : [];
      }),
    [rows, forecasts],
  );

  const reviewActivity = data?.reviewActivity;
  const week = useMemo(
    () =>
      reviewActivity ? weekSummary([...reviewActivity.values()].flat(), Date.now()) : undefined,
    [reviewActivity],
  );

  const totalCards = rows?.reduce((sum, row) => sum + row.due, 0) ?? 0;
  const totalMinutes = Math.round(rows?.reduce((sum, row) => sum + row.minutes, 0) ?? 0);

  return (
    <div className={`${PAGE_FRAME} py-6 sm:py-10`}>
      <h1 className="sr-only">Today</h1>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-ink-soft sm:mb-6">
        {rows && rows.length > 0 && (
          <p
            className="flex items-center gap-5 sm:gap-6"
            aria-label={`Today: ${totalCards} cards, about ${totalMinutes} minutes`}
          >
            <span className="inline-flex items-center gap-2" aria-hidden="true">
              <CardsIcon width={20} height={20} />
              <strong className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
                <CountUp value={totalCards} multiplier={m} />
              </strong>
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
          {activeCourses && activeCourses.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setCreatingCourse(true)}
              className="shrink-0 whitespace-nowrap border-[1.5px] border-ink"
            >
              <PlusIcon width={16} height={16} />
              New course
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {creatingCourse && <NewCourseForm onClose={() => setCreatingCourse(false)} />}
      </AnimatePresence>

      <SyncStatus />

      {!rows ? (
        <DelayedFallback>
          <CourseSkeleton />
        </DelayedFallback>
      ) : rows.length === 0 ? (
        <EmptyState
          hasArchivedCourses={courses?.some((course) => course.archived) ?? false}
          onCreateCourse={() => setCreatingCourse(true)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {(lines.length > 0 || (week?.reviewed ?? 0) > 0) && (
            <motion.section
              aria-label="Forecast and this week"
              className="flex flex-col gap-5 rounded-[28px] bg-surface px-4 pb-5 pt-5 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] sm:px-6 sm:pb-6 sm:pt-7 md:px-8 md:pt-8"
              initial={m > 0 ? { opacity: 0, y: 12, scale: 0.99 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5 * m, ease: MOTION_EASING.emphasised }}
            >
              {lines.length > 0 && <ForecastChart lines={lines} now={Date.now()} multiplier={m} />}
              {week && stats && <WeekPanel week={week} streak={stats.streak} multiplier={m} />}
            </motion.section>
          )}
          <TodayQueue
            rows={rows}
            multiplier={m}
            onStudy={(id) => navigate(`/course/${id}/study`)}
            onMenu={(id, position, trigger) => {
              const course = activeCourses?.find((entry) => entry.id === id);
              if (!course) return;
              setArchiveTarget(null);
              setCourseMenu({ course, position, trigger });
            }}
          />
        </div>
      )}

      {courseMenu && (
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
      )}

      <AnimatePresence>
        {archiveTarget && (
          <ArchiveCourseDialog
            course={archiveTarget.course}
            onClose={() => {
              setArchiveTarget(null);
              archiveTarget.trigger.focus();
            }}
            onArchived={() => {
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
        )}
      </AnimatePresence>
    </div>
  );
}

function CourseContextMenu({
  course,
  position,
  trigger: _trigger,
  onClose,
  onArchive,
}: CourseMenuState & { onClose: (restoreFocus?: boolean) => void; onArchive: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clampedPosition, setClampedPosition] = useState(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const gutter = 8;
    setClampedPosition({
      x: Math.max(gutter, Math.min(position.x, window.innerWidth - menu.offsetWidth - gutter)),
      y: Math.max(gutter, Math.min(position.y, window.innerHeight - menu.offsetHeight - gutter)),
    });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [position]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    return () => window.removeEventListener('pointerdown', closeOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${course.name}`}
      className="fixed z-[70] min-w-40 rounded-xl border border-line-strong bg-surface-raised p-1.5 shadow-xl shadow-black/15"
      style={{ left: clampedPosition.x, top: clampedPosition.y }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none"
        onClick={onArchive}
      >
        Archive
      </button>
    </div>,
    document.body,
  );
}

function ArchiveCourseDialog({
  course,
  onClose,
  onArchived,
}: {
  course: Course;
  onClose: () => void;
  onArchived: () => void;
}) {
  const trapRef = useFocusTrap(true, {
    autoFocusSelector: '[data-confirm-archive]',
    returnFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  async function confirmArchive() {
    setBusy(true);
    setError(null);
    try {
      await updateCourse(course.id, { archived: true });
      onArchived();
    } catch {
      setError('The course could not be archived. Nothing was changed.');
      setBusy(false);
    }
  }

  return createPortal(
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      initial={m > 0 ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={m > 0 ? { opacity: 0 } : undefined}
      transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <ModalBackdrop onClick={() => !busy && onClose()} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-course-title"
        aria-describedby="archive-course-description"
        initial={m > 0 ? { opacity: 0, y: 12, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={m > 0 ? { opacity: 0, y: 12, scale: 0.98 } : undefined}
        transition={m > 0 ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-line-strong bg-paper p-6 shadow-2xl shadow-black/20"
      >
        <h2 id="archive-course-title" className="font-display text-2xl">
          Archive {course.name}?
        </h2>
        <p id="archive-course-description" className="mt-2 text-sm leading-relaxed text-ink-soft">
          This removes the course from active study and Today. Its lessons, cards and review
          history are preserved.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-confirm-archive
            onClick={() => void confirmArchive()}
            disabled={busy}
          >
            {busy ? 'Archiving…' : 'Archive course'}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function CourseSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-80 animate-pulse rounded-[28px] bg-surface" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-[68px] items-center gap-4 rounded-[18px] bg-surface px-5">
          <div className="h-2.5 w-2.5 rounded-full bg-ink/10" />
          <div className="h-5 w-40 animate-pulse rounded bg-ink/10" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasArchivedCourses,
  onCreateCourse,
}: {
  hasArchivedCourses: boolean;
  onCreateCourse: () => void;
}) {
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
        <Button variant="primary" onClick={onCreateCourse}>
          <PlusIcon width={16} height={16} />
          New course
        </Button>
      </div>
    </div>
  );
}
