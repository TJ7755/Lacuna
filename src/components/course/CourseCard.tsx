import { m as motion } from 'motion/react';
import { ProgressBar } from '../ui/ProgressBar';
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
 * Dashboard card for a single Course. Mirrors DeckCard's visual idiom: colour
 * accent bar, exam-date label, course name, lesson/card counts, mastery progress
 * bar, and a "due today" hint. The entire card is a button that calls onClick.
 */
export function CourseCard({ course, summary, onClick }: CourseCardProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const examPassed = course.examDate < Date.now();
  const examLabel = examPassed
    ? 'Exam date passed'
    : `Exam ${relativeExam(course.examDate, Date.now(), course.timeZone)}`;

  const lessonCount = summary?.lessonCount ?? 0;
  const cardCount = summary?.cardCount ?? 0;
  const eligible = summary?.eligible ?? 0;
  const mastery = summary?.mastery ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block h-full w-full text-left"
    >
      <motion.div
        whileHover={{ y: -4, transition: { duration: 0.12 * m } }}
        whileTap={{ scale: 0.98, transition: { duration: 0.08 * m } }}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-line-strong hover:shadow-lg hover:shadow-black/[0.04]"
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
        </div>
      </motion.div>
    </button>
  );
}
