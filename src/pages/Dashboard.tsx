import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCourseDashboardData } from '../state/useCourseData';
import { StudySignals } from '../components/dashboard/StudySignals';
import { ReviewHeatmap } from '../components/dashboard/ReviewHeatmap';
import { Button } from '../components/ui/Button';
import { FlaskIcon, PlayIcon, PlusIcon } from '../components/ui/icons';
import { CourseCard } from '../components/course/CourseCard';
import { NewCourseForm } from '../components/course/NewCourseForm';
import { MemoryBackdrop } from '../components/course/MemoryBackdrop';
import { decayOf } from '../fsrs/fsrs';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useDashboardSort } from '../state/dashboardSort';
import type { Card } from '../db/types';

export function Dashboard() {
  const data = useCourseDashboardData();
  const courses = data?.courses;
  const summaries = data?.summaries;
  const stats = data?.stats;
  const allCards = data?.allCards;
  const navigate = useNavigate();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [dashboardSort] = useDashboardSort();

  // Active courses only (archived ones are hidden from the main grid), ordered per
  // the "Choose how courses are ordered" dashboard setting.
  const activeCourses = useMemo(() => {
    const active = courses?.filter((c) => !c.archived);
    if (!active) return undefined;
    const sorted = [...active];
    switch (dashboardSort) {
      case 'ready':
        sorted.sort((a, b) => (summaries?.[b.id]?.eligible ?? 0) - (summaries?.[a.id]?.eligible ?? 0));
        break;
      case 'mastery':
        sorted.sort((a, b) => (summaries?.[a.id]?.mastery ?? 0) - (summaries?.[b.id]?.mastery ?? 0));
        break;
      case 'exam':
        sorted.sort((a, b) => a.examDate - b.examDate);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => (b.lastInteractedAt ?? b.createdAt) - (a.lastInteractedAt ?? a.createdAt));
        break;
    }
    return sorted;
  }, [courses, summaries, dashboardSort]);

  // Total cards a global session would serve today, across all active courses.
  const totalEligible = useMemo(
    () =>
      (activeCourses ?? []).reduce(
        (sum, c) => sum + (summaries?.[c.id]?.eligible ?? 0),
        0,
      ),
    [activeCourses, summaries],
  );

  // Per-course decay exponents, keyed by courseId, for the backdrop's per-card
  // retrievability maths — courses can carry different FSRS parameters, so a
  // single scalar decay (as single-course pages use) would misrepresent cards
  // from any course but one.
  const decayByCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of courses ?? []) map.set(c.id, decayOf(c.fsrsParameters));
    return map;
  }, [courses]);
  const decayFor = useMemo(
    () => (card: Card) => (card.courseId ? (decayByCourse.get(card.courseId) ?? 0) : 0),
    [decayByCourse],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      {/* Ambient constellation: every card across every active course as a
          point of light behind the page — bright when well remembered,
          hollow when unseen, breathing when due. */}
      {allCards && allCards.length > 0 && (
        <MemoryBackdrop
          cards={allCards}
          decayFor={decayFor}
          now={Date.now()}
          onOpenCard={(card) =>
            card.courseId &&
            card.primaryLessonId &&
            navigate(
              `/course/${card.courseId}/lesson/${card.primaryLessonId}/cards/${card.id}/edit`,
            )
          }
        />
      )}
      {/* Page header */}
      <header className="relative mb-10 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="absolute inset-0 bg-dot-grid opacity-40" aria-hidden="true" />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">
              Your revision
            </p>
            <h1 className="font-display text-4xl tracking-tight md:text-6xl">Courses</h1>
          </div>
          {activeCourses && activeCourses.length > 0 && (
            <Button variant="primary" onClick={() => setCreatingCourse(true)}>
              <PlusIcon width={16} height={16} />
              New course
            </Button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {creatingCourse && (
          <NewCourseForm onClose={() => setCreatingCourse(false)} />
        )}
      </AnimatePresence>

      {/* Motivation strip: streak, reviews today, seven-day time forecast */}
      {stats && activeCourses && activeCourses.length > 0 && (
        <StudySignals stats={stats} courses={activeCourses} />
      )}

      {/* Global "study everything" entry point */}
      <AnimatePresence>
        {activeCourses && activeCourses.length > 0 && totalEligible > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm shadow-black/[0.02]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                <PlayIcon width={14} height={14} />
                {totalEligible} due
              </span>
              <span className="text-xs text-ink-soft">across all courses</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="ml-auto"
              onClick={() => navigate('/learn')}
            >
              <PlayIcon width={16} height={16} />
              Study all
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Course grid */}
      {!activeCourses ? (
        <CourseSkeleton motionMultiplier={m} />
      ) : activeCourses.length === 0 ? (
        <EmptyState motionMultiplier={m} onCreateCourse={() => setCreatingCourse(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeCourses.map((course, i) => (
            <motion.div
              key={course.id}
              className="h-full"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.24 * m,
                delay: Math.min(i * 0.04, 0.2) * m,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <CourseCard
                course={course}
                summary={summaries?.[course.id]}
                onClick={() => navigate(`/course/${course.id}`)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Review activity heatmap */}
      {allCards && allCards.some((c) => c.history.length > 0) && (
        <div className="mt-10">
          <ReviewHeatmap cards={allCards} />
        </div>
      )}
    </div>
  );
}

function CourseSkeleton({ motionMultiplier }: { motionMultiplier?: number }) {
  const m = motionMultiplier ?? 1;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 * m, delay: Math.min(i * 0.04, 0.2) * m }}
          className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5"
        >
          <div className="mb-1 h-3 w-20 animate-pulse rounded bg-ink/10" />
          <div className="mb-4 h-7 w-3/4 animate-pulse rounded bg-ink/10" />
          <div className="mt-auto">
            <div className="mb-2 flex justify-between">
              <div className="h-4 w-36 animate-pulse rounded bg-ink/10" />
              <div className="h-4 w-12 animate-pulse rounded bg-ink/10" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-full bg-ink/10" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function EmptyState({
  motionMultiplier,
  onCreateCourse,
}: {
  motionMultiplier?: number;
  onCreateCourse: () => void;
}) {
  const m = motionMultiplier ?? 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 * m, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface/50 py-20 text-center"
    >
      <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
      <div className="relative">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 * m, ease: [0.16, 1, 0.3, 1], delay: 0.1 * m }}
          className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent shadow-sm shadow-accent/20"
        >
          <FlaskIcon width={28} height={28} />
        </motion.div>
        <h2 className="mb-2 font-display text-2xl">No courses yet</h2>
        <p className="mb-6 max-w-sm text-ink-soft">
          Start a course to organise your lessons and cards.
        </p>
        <Button variant="primary" onClick={onCreateCourse}>
          <PlusIcon width={16} height={16} />
          New course
        </Button>
      </div>
    </motion.div>
  );
}
