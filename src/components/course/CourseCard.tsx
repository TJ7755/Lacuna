import { useState } from 'react';
import { m as motion } from 'motion/react';
import { ProgressBar } from '../ui/ProgressBar';
import { MiniRing } from '../ui/MiniRing';
import { relativeExam } from '../../utils/datetime';
import { progressNoun } from '../../fsrs/objective';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import type { Course } from '../../db/types';
import type { CourseSummary } from '../../state/useCourseData';

export interface CourseCardProps {
  course: Course;
  summary?: CourseSummary;
  onClick: () => void;
}

/**
 * Dashboard card for a single Course: colour accent bar, exam-date label, course
 * name, lesson/card counts, mastery progress bar, and a "due today" hint. The
 * entire card is a button that calls onClick.
 *
 * Hovering or focusing the card expands a detail panel beneath the stats —
 * mastery ring, new/due split — as an absolutely positioned overlay (see
 * `expanded`), so the reveal never reflows the dashboard grid: the panel sits
 * above whatever is below it rather than pushing the row taller. Mirrors the
 * hover-to-squircle pattern used by LessonNode on the course path.
 */
export function CourseCard({ course, summary, onClick }: CourseCardProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [expanded, setExpanded] = useState(false);

  const examPassed = course.examDate < Date.now();
  const examLabel = examPassed
    ? 'Exam date passed'
    : `Exam ${relativeExam(course.examDate, Date.now(), course.timeZone)}`;

  const lessonCount = summary?.lessonCount ?? 0;
  const cardCount = summary?.cardCount ?? 0;
  const eligible = summary?.eligible ?? 0;
  const unreviewed = summary?.unreviewed ?? 0;
  const mastery = summary?.mastery ?? 0;
  const hasDetail = summary !== undefined && cardCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      className="group relative block h-full w-full text-left"
    >
      <motion.div
        whileHover={{ y: -4, transition: { duration: 0.12 * m } }}
        whileTap={{ scale: 0.98, transition: { duration: 0.08 * m } }}
        className={cn('relative z-0 h-full', expanded && hasDetail && 'z-20')}
      >
        {/* Clipped face: rounded corners and the colour accent bar live here
            so the detail overlay below can render outside these bounds
            without being clipped by them. */}
        <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm shadow-black/[0.02] transition-all duration-200 group-hover:border-line-strong group-hover:shadow-lg group-hover:shadow-black/[0.04]">
          {/* Colour accent bar */}
          {course.colour && (
            <span
              className="absolute inset-x-0 top-0 h-1"
              style={{ backgroundColor: course.colour }}
            />
          )}

          {/* Exam date label */}
          <div
            className={cn(
              'mb-1 text-xs uppercase tracking-[0.14em]',
              examPassed ? 'text-amber-600' : 'text-ink-faint',
            )}
          >
            {examLabel}
          </div>

          {/* Course name */}
          <h3 className="mb-4 font-display text-2xl leading-tight tracking-tight">
            {course.name}
          </h3>

          {/* Stats and progress */}
          <div className="mt-auto">
            <div className="mb-2 flex items-center justify-between text-sm text-ink-soft">
              <span>
                {lessonCount} lesson{lessonCount === 1 ? '' : 's'} · {cardCount} card{cardCount === 1 ? '' : 's'}
              </span>
              <span className="tabular-nums">
                {Math.round(mastery * 100)}% {progressNoun(course)}
              </span>
            </div>
            <ProgressBar value={mastery} height={8} />
            {eligible > 0 && (
              <div className="mt-2 text-xs text-accent">
                {eligible} due today
              </div>
            )}
          </div>
        </div>

        {/* Hover/focus detail: overlaid below the card face, not laid out in
            flow, so the reveal never grows the grid row. */}
        {hasDetail && (
          <motion.div
            initial={false}
            animate={
              expanded
                ? { height: 'auto', opacity: 1, marginTop: 10 }
                : { height: 0, opacity: 0, marginTop: 0 }
            }
            transition={
              m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 * m }
            }
            className="absolute inset-x-0 top-full overflow-hidden rounded-xl border border-line bg-surface-raised shadow-md shadow-black/10"
            style={{ pointerEvents: expanded ? 'auto' : 'none' }}
          >
            <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-xs text-ink-soft">
              <span>
                {unreviewed} new · {Math.max(cardCount - unreviewed - eligible, 0)} learnt
                {eligible > 0 && ` · ${eligible} due`}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-ink">
                <MiniRing value={mastery} size={16} strokeWidth={2.5} />
                {Math.round(mastery * 100)}%
              </span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </button>
  );
}
