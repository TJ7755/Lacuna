import { useMemo, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { ProgressBar } from '../ui/ProgressBar';
import { relativeExam, startOfDay } from '../../utils/datetime';
import { progressNoun } from '../../fsrs/objective';
import { cn } from '../ui/cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { useCourseCardDetail } from '../../state/courseCardDetail';
import type { Card, Course } from '../../db/types';
import type { CourseSummary } from '../../state/useCourseData';

export interface CourseCardProps {
  course: Course;
  summary?: CourseSummary;
  /** The course's cards, used by the hover detail modules. */
  cards?: Card[];
  onClick: () => void;
}

const DAY_MS = 86_400_000;
const ACTIVITY_DAYS = 14;

/** House ease used across the app's reveals. */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Compact relative label for the next scheduled review. */
function relativeDue(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs;
  if (diff <= 0) return 'ready now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} days`;
}

/**
 * Dashboard card for a single Course: colour accent bar, exam-date label, course
 * name, lesson/card counts, mastery progress bar, and a "due today" hint. The
 * entire card is a button that calls onClick.
 *
 * Hovering or focusing the card grows it downward to reveal detail modules
 * (next review, new/learnt/due breakdown, recent activity — each toggleable in
 * Settings). An invisible in-flow ghost of the collapsed face reserves the
 * card's normal grid footprint so the dashboard never reflows; the real card
 * is positioned absolutely over it and its
 * height follows the single animated detail wrapper — only that wrapper
 * animates, so there are no competing height springs.
 */
export function CourseCard({ course, summary, cards, onClick }: CourseCardProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [detailSettings] = useCourseCardDetail();
  const [expanded, setExpanded] = useState(false);
  // Keep the card stacked above its neighbours until the collapse finishes,
  // so it never drops behind them mid-animation.
  const [lifted, setLifted] = useState(false);

  const examPassed = course.examDate < Date.now();
  const examLabel = examPassed
    ? 'Exam date passed'
    : `Exam ${relativeExam(course.examDate, Date.now(), course.timeZone)}`;

  const lessonCount = summary?.lessonCount ?? 0;
  const cardCount = summary?.cardCount ?? 0;
  const eligible = summary?.eligible ?? 0;
  const unreviewed = summary?.unreviewed ?? 0;
  const mastery = summary?.mastery ?? 0;
  const learnt = Math.max(cardCount - unreviewed - eligible, 0);

  // Earliest scheduled review across the course's active cards.
  const nextDueLabel = useMemo(() => {
    if (!detailSettings.nextDue || !cards) return null;
    const now = Date.now();
    let earliest: number | null = null;
    for (const card of cards) {
      if (card.due === null || card.suspended) continue;
      if (earliest === null || card.due < earliest) earliest = card.due;
    }
    return earliest === null ? null : relativeDue(earliest, now);
  }, [detailSettings.nextDue, cards]);

  // Reviews per day over the last two weeks, oldest first.
  const activity = useMemo(() => {
    if (!detailSettings.activity || !cards) return null;
    const today = startOfDay(Date.now());
    const counts = new Array<number>(ACTIVITY_DAYS).fill(0);
    let total = 0;
    for (const card of cards) {
      for (const log of card.history) {
        const age = Math.round((today - startOfDay(log.timestamp)) / DAY_MS);
        if (age >= 0 && age < ACTIVITY_DAYS) {
          counts[ACTIVITY_DAYS - 1 - age] += 1;
          total += 1;
        }
      }
    }
    return { counts, total, max: Math.max(...counts, 1) };
  }, [detailSettings.activity, cards]);

  const modules: ReactNode[] = [];
  if (nextDueLabel !== null) {
    modules.push(
      <div key="nextDue" className="flex items-baseline justify-between text-xs">
        <span className="text-ink-faint">Next review</span>
        <span className="tabular-nums text-ink">{nextDueLabel}</span>
      </div>,
    );
  }
  if (detailSettings.breakdown && cardCount > 0) {
    modules.push(
      <div key="breakdown" className="flex items-center gap-3 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-transparent ring-1 ring-ink/40" />
          {unreviewed} new
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink/30" />
          {learnt} learnt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {eligible} due
        </span>
      </div>,
    );
  }
  if (activity !== null) {
    modules.push(
      <div key="activity" className="flex items-end justify-between gap-3">
        <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
          {activity.counts.map((count, i) => (
            <span
              key={i}
              className={cn(
                'w-1 rounded-full',
                count > 0 ? 'bg-accent/70' : 'bg-ink/10',
              )}
              style={{
                height: count > 0 ? `${25 + (count / activity.max) * 75}%` : '3px',
              }}
            />
          ))}
        </div>
        <span className="text-xs tabular-nums text-ink-faint">
          {activity.total} review{activity.total === 1 ? '' : 's'} · 2 weeks
        </span>
      </div>,
    );
  }

  const hasDetail = summary !== undefined && cardCount > 0 && modules.length > 0;
  const isExpanded = expanded && hasDetail;

  const face = (
    <>
      {/* Exam date label */}
      <div
        className={cn(
          'mb-1 text-xs uppercase tracking-[0.14em]',
          examPassed ? 'text-warning-fg' : 'text-ink-faint',
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
    </>
  );

  return (
    // Reserved slot: the invisible in-flow ghost gives the wrapper the
    // collapsed card's real height, so the grid sizes exactly as if the card
    // were in flow and never reflows while the expanding card overlays
    // neighbours from this footprint.
    <div className="group relative h-full w-full">
      <div
        className="invisible flex h-full flex-col rounded-2xl border p-5"
        aria-hidden="true"
      >
        {face}
      </div>
      <motion.button
        type="button"
        onClick={onClick}
        onMouseEnter={() => {
          setExpanded(true);
          setLifted(true);
        }}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => {
          setExpanded(true);
          setLifted(true);
        }}
        onBlur={() => setExpanded(false)}
        whileHover={{ y: -4, transition: { duration: 0.12 * m } }}
        whileTap={{ scale: 0.98, transition: { duration: 0.08 * m } }}
        className={cn(
          'absolute inset-x-0 top-0 flex min-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 text-left shadow-sm shadow-black/[0.02] transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lg hover:shadow-black/[0.04]',
          lifted ? 'z-20' : 'z-0',
        )}
      >
        {/* Colour accent bar */}
        {course.colour && (
          <span
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: course.colour }}
          />
        )}

        {face}

        {/* Hover/focus detail: the card's height follows this wrapper — the
            only element whose height animates. */}
        {hasDetail && (
          <motion.div
            initial={false}
            animate={isExpanded ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: (isExpanded ? 0.3 : 0.22) * m, ease: EASE }}
            onAnimationComplete={() => {
              if (!isExpanded) setLifted(false);
            }}
            className="-mx-5 overflow-hidden px-5"
            aria-hidden={!isExpanded}
          >
            <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3.5">
              {modules.map((module, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={isExpanded ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                  transition={{
                    duration: 0.2 * m,
                    delay: (isExpanded ? 0.06 + i * 0.05 : 0) * m,
                    ease: EASE,
                  }}
                >
                  {module}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.button>
    </div>
  );
}
