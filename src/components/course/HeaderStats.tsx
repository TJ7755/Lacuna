// Stat pills for the course/lesson headers (CoursePath, LessonView),
// replacing the old fieldStandfirst editorial sentence with a row of
// small labelled cards. Same inputs as fieldStandfirst, plus optional
// lesson progress. British English throughout.

import {
  HourglassIcon,
  CompassIcon,
  GaugeIcon,
  CalendarClockIcon,
  MilestoneIcon,
} from '../ui/icons';
import { cn } from '../ui/cn';

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
        accent
          ? 'border-accent/40 bg-accent-fg/10 text-ink'
          : 'border-line-strong text-ink-soft',
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
  if (totalCards === 0) {
    return (
      <p className={cn('max-w-prose text-sm text-ink-soft', className)}>
        No cards yet — add some to start mapping this memory.
      </p>
    );
  }

  // Pill count is always 3-5: due/mastery/days-to-go are permanent, unmapped
  // and lesson-progress are conditional. Grid columns are keyed to that count
  // so rows come out full or evenly balanced (e.g. 3+2, not a 4+1 orphan)
  // rather than left-aligned flex-wrap ragged rows. Columns are max-content,
  // not fractions, so pills are never squeezed into wrapping their labels.
  const pillCount = 3 + (unseenCount > 0 ? 1 : 0) + (lessonProgress ? 1 : 0);
  const gridColsClass =
    pillCount === 5
      ? 'grid-cols-[repeat(3,max-content)]'
      : pillCount === 4
        ? 'grid-cols-[repeat(2,max-content)] md:grid-cols-[repeat(4,max-content)]'
        : 'grid-cols-[repeat(3,max-content)]';

  return (
    <div className={cn('grid gap-2', gridColsClass, className)}>
      <Pill
        icon={<HourglassIcon width={15} height={15} />}
        value={dueCount === 0 ? 'Nothing' : String(dueCount)}
        label="due now"
        accent={dueCount > 0}
      />
      {unseenCount > 0 && (
        <Pill
          icon={<CompassIcon width={15} height={15} />}
          value={String(unseenCount)}
          label="unmapped"
        />
      )}
      <Pill
        icon={<GaugeIcon width={15} height={15} />}
        value={`${masteryPct}%`}
        label="mastery"
      />
      <Pill
        icon={<CalendarClockIcon width={15} height={15} />}
        value={daysToExam <= 0 ? 'Exam day' : String(daysToExam)}
        label={daysToExam <= 0 ? 'is here' : daysToExam === 1 ? 'day to go' : 'days to go'}
      />
      {lessonProgress && (
        <Pill
          icon={<MilestoneIcon width={15} height={15} />}
          value={`${lessonProgress.reached} of ${lessonProgress.total}`}
          label="lessons"
        />
      )}
    </div>
  );
}
