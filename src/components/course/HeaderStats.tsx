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
import {
  useCourseHeaderSettings,
  type CourseStatId,
} from '../../state/courseHeaderSettings';

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
  const [{ statPills }] = useCourseHeaderSettings();

  if (totalCards === 0) {
    return (
      <p className={cn('max-w-prose text-sm text-ink-soft', className)}>
        No cards yet — add some to start mapping this memory.
      </p>
    );
  }

  // Which pills exist at all is a data question; which of those appear is the reader's,
  // set in Settings. Both filters apply, and the stored order is honoured, so a reader
  // who cares most about the countdown can put it first.
  const available: Partial<Record<CourseStatId, React.ReactNode>> = {
    due: (
      <Pill
        key="due"
        icon={<HourglassIcon width={15} height={15} />}
        value={dueCount === 0 ? 'Nothing' : String(dueCount)}
        label="due now"
        accent={dueCount > 0}
      />
    ),
    unmapped:
      unseenCount > 0 ? (
        <Pill
          key="unmapped"
          icon={<CompassIcon width={15} height={15} />}
          value={String(unseenCount)}
          label="unmapped"
        />
      ) : undefined,
    mastery: (
      <Pill
        key="mastery"
        icon={<GaugeIcon width={15} height={15} />}
        value={`${masteryPct}%`}
        label="mastery"
      />
    ),
    exam: (
      <Pill
        key="exam"
        icon={<CalendarClockIcon width={15} height={15} />}
        value={daysToExam <= 0 ? 'Exam day' : String(Math.max(daysToExam, 0))}
        label={daysToExam <= 0 ? 'is here' : daysToExam === 1 ? 'day to go' : 'days to go'}
      />
    ),
    lessons: lessonProgress ? (
      <Pill
        key="lessons"
        icon={<MilestoneIcon width={15} height={15} />}
        value={`${lessonProgress.reached} of ${lessonProgress.total}`}
        label="lessons"
      />
    ) : undefined,
  };

  const pills = statPills
    .filter((pill) => pill.visible)
    .map((pill) => available[pill.id])
    .filter((pill): pill is React.ReactNode => pill !== undefined);

  if (pills.length === 0) return null;

  // From sm upwards, keyed grid columns keep rows evenly balanced (e.g. 3+2, not a 4+1
  // orphan) without squeezing labels.
  //
  // Below sm the pills used to wrap freely, which packed them one-and-two to a row by
  // whatever happened to fit and read as ragged rather than deliberate. A plain
  // two-column grid aligns them instead. It drops to one column under 360px, where two
  // pills plus the touch font scale would overflow rather than wrap, since the pills
  // themselves are whitespace-nowrap.
  const gridColsClass =
    pills.length === 4
      ? 'sm:grid-cols-[repeat(2,max-content)] md:grid-cols-[repeat(4,max-content)]'
      : 'sm:grid-cols-[repeat(3,max-content)]';

  return (
    <div
      className={cn(
        'grid max-w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2',
        gridColsClass,
        className,
      )}
    >
      {pills}
    </div>
  );

}
