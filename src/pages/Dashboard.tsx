import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourseDashboardData, usePendingUpdateCourseIds } from '../state/useCourseData';
import { StudySignals } from '../components/dashboard/StudySignals';
import { SyncStatus } from '../components/dashboard/SyncStatus';
import { ReviewHeatmap } from '../components/dashboard/ReviewHeatmap';
import { Button } from '../components/ui/Button';
import { LacunaIcon, PlusIcon } from '../components/ui/icons';
import { CourseCard } from '../components/course/CourseCard';
import { NewCourseForm } from '../components/course/NewCourseForm';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useDashboardSort } from '../state/dashboardSort';
import { updateCourse } from '../db/repository';
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
  const courseDetails = data?.courseDetails;
  const reviewHeatmap = data?.reviewHeatmap;
  const pendingUpdateIds = usePendingUpdateCourseIds();
  const navigate = useNavigate();
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [dashboardSort] = useDashboardSort();
  const { notify } = useToast();
  const [courseMenu, setCourseMenu] = useState<CourseMenuState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

  // Active courses only (archived ones are hidden from the main grid), ordered per
  // the "Choose how courses are ordered" dashboard setting.
  const activeCourses = useMemo(() => {
    const active = courses?.filter((c) => !c.archived);
    if (!active) return undefined;
    const sorted = [...active];
    switch (dashboardSort) {
      case 'ready':
        sorted.sort(
          (a, b) => (summaries?.[b.id]?.eligible ?? 0) - (summaries?.[a.id]?.eligible ?? 0),
        );
        break;
      case 'mastery':
        sorted.sort(
          (a, b) => (summaries?.[a.id]?.mastery ?? 0) - (summaries?.[b.id]?.mastery ?? 0),
        );
        break;
      case 'exam':
        sorted.sort(
          (a, b) =>
            (a.examDate ?? Number.POSITIVE_INFINITY) - (b.examDate ?? Number.POSITIVE_INFINITY),
        );
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'recent':
      default:
        sorted.sort(
          (a, b) => (b.lastInteractedAt ?? b.createdAt) - (a.lastInteractedAt ?? a.createdAt),
        );
        break;
    }
    return sorted;
  }, [courses, summaries, dashboardSort]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      {/* Page header */}
      {/* On a phone the title and non-shrinking action share limited horizontal space.
          Keep the side padding tight while giving the single-line heading balanced
          vertical space at each breakpoint. */}
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-5 md:mb-10 md:px-8 md:py-7">
        <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl tracking-tight md:text-6xl">Courses</h1>
          </div>
          {activeCourses && activeCourses.length > 0 && (
            <Button
              variant="primary"
              onClick={() => setCreatingCourse(true)}
              className="shrink-0 whitespace-nowrap"
            >
              <PlusIcon width={16} height={16} />
              New course
            </Button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {creatingCourse && <NewCourseForm onClose={() => setCreatingCourse(false)} />}
      </AnimatePresence>

      <SyncStatus />

      {/* Motivation strip: streak, reviews today, seven-day time forecast */}
      {stats && activeCourses && activeCourses.length > 0 && (
        <StudySignals stats={stats} courses={activeCourses} />
      )}

      {/* Course grid */}
      {!activeCourses ? (
        <DelayedFallback>
          <CourseSkeleton />
        </DelayedFallback>
      ) : activeCourses.length === 0 ? (
        <EmptyState
          hasArchivedCourses={courses?.some((course) => course.archived) ?? false}
          onCreateCourse={() => setCreatingCourse(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeCourses.map((course) => (
            <div key={course.id} className="h-full">
              <CourseCard
                course={course}
                summary={summaries?.[course.id]}
                detail={courseDetails?.[course.id]}
                hasPendingUpdate={pendingUpdateIds?.has(course.id) ?? false}
                onClick={() =>
                  navigate(
                    pendingUpdateIds?.has(course.id)
                      ? `/course/${course.id}/updates`
                      : `/course/${course.id}`,
                  )
                }
                onStudy={() => navigate(`/course/${course.id}/study`)}
                onArchiveMenu={(position, trigger) => {
                  setArchiveTarget(null);
                  setCourseMenu({ course, position, trigger });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Review activity heatmap */}
      {reviewHeatmap?.hasReviewHistory && (
        <div className="mt-10">
          <ReviewHeatmap data={reviewHeatmap} />
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
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
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
          This removes the course from active study and the dashboard. Its lessons, cards and review
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5">
          <div className="mb-1 h-3 w-20 animate-pulse rounded bg-ink/10" />
          <div className="mb-4 h-7 w-3/4 animate-pulse rounded bg-ink/10" />
          <div className="mt-auto">
            <div className="mb-2 flex justify-between">
              <div className="h-4 w-36 animate-pulse rounded bg-ink/10" />
              <div className="h-4 w-12 animate-pulse rounded bg-ink/10" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-full bg-ink/10" />
          </div>
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
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface/50 py-20 text-center">
      <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
      <div className="relative flex flex-col items-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent shadow-sm shadow-accent/20">
          <LacunaIcon width={28} height={28} />
        </div>
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
