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
 * Hovering or focusing the card grows the card itself downward — mastery ring,
 * new/due split fade in beneath the stats — rather than revealing a separate
 * panel. The outer wrapper reserves the card's normal grid-cell footprint so
 * the dashboard grid never reflows; the card is positioned absolutely within
 * it and animates its own height, lifting (z-index + shadow) to overlay
 * whatever sits below its original bounds. Mirrors the hover-to-squircle
 * pattern used by LessonNode on the course path.
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
  const isExpanded = expanded && hasDetail;

  return (
    // Reserved slot: matches the grid cell's stretched height so neighbours
    // never reflow while the card grows over them from this footprint.
    <div className="group relative h-full w-full">
      <motion.button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        animate={{
          height: isExpanded ? 'auto' : '100%',
          y: isExpanded ? -4 : 0,
        }}
        whileTap={{ scale: 0.98, transition: { duration: 0.08 * m } }}
        transition={
          m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 * m }
        }
        className={cn(
          'absolute inset-x-0 top-0 flex min-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 text-left shadow-sm shadow-black/[0.02] transition-[border-color,box-shadow] duration-200 hover:border-line-strong',
          isExpanded && 'z-20 border-line-strong shadow-lg shadow-black/[0.06]',
        )}
      >
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

          {/* Hover/focus detail: grows the card's own body downward rather
              than revealing a separate panel beneath it. */}
          {hasDetail && (
            <motion.div
              initial={false}
              animate={
                expanded
                  ? { height: 'auto', opacity: 1, marginTop: 12 }
                  : { height: 0, opacity: 0, marginTop: 0 }
              }
              transition={
                m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 * m }
              }
              className="-mx-5 overflow-hidden border-t border-line px-5"
            >
              <div className="flex items-center justify-between gap-3 pt-3 text-xs text-ink-soft">
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
        </div>
      </motion.button>
    </div>
  );
}
