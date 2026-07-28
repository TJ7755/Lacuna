// Stat pills for the course/lesson headers (CoursePath, LessonView),
// replacing the old editorial sentence with a row of small labelled cards.
// Supports optional lesson progress. British English throughout.

import {
  HourglassIcon,
  CompassIcon,
  GaugeIcon,
  CalendarClockIcon,
  MilestoneIcon,
} from '../ui/icons';
import { cn } from '../ui/cn';
import { useCountUp } from '../../hooks/useCountUp';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

export interface HeaderStatsProps {
  dueCount: number;
  masteryPct: number;
  daysToExam: number;
  totalCards: number;
  unseenCount: number;
  /** Lesson progress within a course — omit on LessonView, which has no path. */
  lessonProgress?: { reached: number; total: number };
  className?: string;
}

function Pill({
  icon,
  value,
  label,
  accent = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
        accent ? 'border-accent/40 bg-accent-fg/10 text-ink' : 'border-line-strong text-ink-soft',
      )}
    >
      <span className={cn('shrink-0', accent ? 'text-accent' : 'text-ink-faint')}>{icon}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-faint">{label}</span>
    </div>
  );
}

/** Row of labelled stat pills replacing the old standfirst sentence. */
export function HeaderStats({
  dueCount,
  masteryPct,
  daysToExam,
  totalCards,
  unseenCount,
  lessonProgress,
  className,
}: HeaderStatsProps) {
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const animatedDueCount = useCountUp(dueCount, 1000, 300, motionMultiplier);
  const animatedUnseenCount = useCountUp(unseenCount, 1000, 375, motionMultiplier);
  const animatedMasteryPct = useCountUp(masteryPct, 1000, 450, motionMultiplier);
  const animatedDaysToExam = useCountUp(Math.max(daysToExam, 0), 1000, 525, motionMultiplier);
  const animatedReached = useCountUp(lessonProgress?.reached ?? 0, 1000, 600, motionMultiplier);
  const animatedLessonTotal = useCountUp(lessonProgress?.total ?? 0, 1000, 600, motionMultiplier);

  if (totalCards === 0) {
    return (
      <p className={cn('max-w-prose text-sm text-ink-soft', className)}>
        No cards yet — add some to start mapping this memory.
      </p>
    );
  }

  // Pill count is always 3-5: due/mastery/days-to-go are permanent, unmapped
  // and lesson-progress are conditional. Small screens wrap naturally because
  // even three max-content pills cannot reliably fit inside the padded header.
  // From sm upwards, keyed grid columns keep rows evenly balanced (e.g. 3+2,
  // not a 4+1 orphan) without squeezing labels.
  const pillCount = 3 + (unseenCount > 0 ? 1 : 0) + (lessonProgress ? 1 : 0);
  const gridColsClass =
    pillCount === 5
      ? 'sm:grid-cols-[repeat(3,max-content)]'
      : pillCount === 4
        ? 'sm:grid-cols-[repeat(2,max-content)] md:grid-cols-[repeat(4,max-content)]'
        : 'sm:grid-cols-[repeat(3,max-content)]';

  return (
    <div className={cn('flex max-w-full flex-wrap gap-2 sm:grid', gridColsClass, className)}>
      <Pill
        icon={<HourglassIcon width={15} height={15} />}
        value={dueCount === 0 ? 'Nothing' : String(animatedDueCount)}
        label="due now"
        accent={dueCount > 0}
      />
      {unseenCount > 0 && (
        <Pill
          icon={<CompassIcon width={15} height={15} />}
          value={String(animatedUnseenCount)}
          label="unmapped"
        />
      )}
      <Pill
        icon={<GaugeIcon width={15} height={15} />}
        value={`${animatedMasteryPct}%`}
        label="mastery"
      />
      <Pill
        icon={<CalendarClockIcon width={15} height={15} />}
        value={daysToExam <= 0 ? 'Exam day' : String(animatedDaysToExam)}
        label={daysToExam <= 0 ? 'is here' : daysToExam === 1 ? 'day to go' : 'days to go'}
      />
      {lessonProgress && (
        <Pill
          icon={<MilestoneIcon width={15} height={15} />}
          value={`${animatedReached} of ${animatedLessonTotal}`}
          label="lessons"
        />
      )}
    </div>
  );
}
